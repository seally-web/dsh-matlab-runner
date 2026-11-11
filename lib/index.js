/**
 * dsh-matlab-runner — host half.
 *
 * Registers:
 *  - `/matlab/api/*` routes on the web server (panel <-> MATLAB),
 *  - one agent tool, `matlab_run`, so the model can execute a .m file and read
 *    MATLAB's console output back.
 *
 * The spawn goes through `ctx.subprocess` rather than a shell tool, so MATLAB
 * runs with the host system user's permissions instead of the session sandbox —
 * that is what lets MATLAB write its preference directory under
 * ~/Library/Application Support/MathWorks.
 * @module dsh-matlab-runner
 */
import { statSync } from 'node:fs'

/**
 * Local stand-in for the host's `defineTool` typing helper (identity at
 * runtime). Importing `@deepseek-ai/dsh-tools` would make this module depend on
 * the host's bundle layout, which is not resolvable from a profile install on
 * every dsh release — a plain object is what the tools service registers anyway.
 */
const defineTool = (definition) => definition
import { join, resolve } from 'node:path'
import {
  createRunner,
  defaultConfig,
  loadConfig,
  saveConfig,
  withDetectedWorkspace
} from './runner.js'

export const inject = ['webServer', 'subprocess', 'workspaceRegistry']

/** Describe (never throw) a failure for the client envelope. */
function failure(error) {
  return { ok: false, error: { message: String(error?.message ?? error) } }
}

/** Read a bounded JSON request body. */
async function readJson(request, limit = 8 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(body)
}

/** Route suffix below the mounted prefix, e.g. `/matlab/api/poll?id=1` -> `poll`. */
function suffixOf(url, prefix = '/matlab/api') {
  const path = (url || '/').split('?')[0]
  const at = path.indexOf(prefix)
  const rest = at === -1 ? path : path.slice(at + prefix.length)
  return rest.replace(/^\/+|\/+$/g, '')
}

/** Query parameter from a route URL. */
function queryParam(url, name) {
  try {
    const query = new URL(url, 'http://localhost').searchParams
    return query.get(name) ?? undefined
  } catch {
    return undefined
  }
}

/** Absolute-ize a user supplied script path against the configured workdir. */
function scriptPathFrom(config, raw) {
  const value = String(raw ?? '').trim()
  if (value === '') throw new Error('missing script path')
  const isAbsolute = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)
  return isAbsolute ? resolve(value) : resolve(config.workdir, value)
}

/** True when `path` is an existing directory. */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function apply(ctx) {
  /**
   * Where the panel currently works. The browser sends its session's workspace
   * root with every call (`?cwd=`), so opening another folder in DSH just works.
   * Without it we fall back to the registered workspaces, then to the host cwd.
   */
  const detected = { cwd: undefined, at: 0, source: 'fallback', error: '' }

  // A panel call refreshes the workspace; anything older is stale (the agent
  // tool and scripts must not inherit a folder the user closed long ago).
  const detectTtlMs = () => Number(process.env.DSH_MATLAB_RUNNER_DETECT_TTL_MS ?? 120000)

  const registeredRoot = () => {
    try {
      const list = ctx.workspaceRegistry?.list?.() ?? []
      const first = Array.isArray(list) ? list.find((item) => typeof item?.path === 'string') : undefined
      return first?.path
    } catch {
      return undefined
    }
  }

  /** Adopt a workspace root reported by the panel, when it is a real folder. */
  const activate = (candidate) => {
    if (typeof candidate !== 'string' || candidate.trim() === '') return
    const abs = resolve(candidate.trim())
    if (!abs.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(abs)) return
    if (!isDirectory(abs)) {
      detected.error = `workspace not found: ${abs}`
      return
    }
    detected.cwd = abs
    detected.at = Date.now()
    detected.source = 'session'
    detected.error = ''
  }

  /** The workspace to use right now: session-reported, registered, or host cwd. */
  const currentWorkspace = () => {
    const fresh = detected.cwd !== undefined && Date.now() - detected.at < detectTtlMs()
    if (fresh) return { cwd: detected.cwd, source: 'session', error: detected.error }
    const root = registeredRoot()
    if (typeof root === 'string' && isDirectory(root)) return { cwd: root, source: 'registry' }
    return { cwd: process.cwd(), source: 'fallback' }
  }

  /** Config with the paths resolved against the active workspace. */
  const effectiveConfig = async () => {
    const base = await loadConfig()
    if (base.autoDetect === false) return withDetectedWorkspace(base, undefined)
    return withDetectedWorkspace(base, currentWorkspace())
  }

  /**
   * Make path failures actionable: say which workspace the panel is on and how
   * to move it, instead of only naming the rejected path.
   */
  const explain = (error) => {
    const message = String(error?.message ?? error)
    if (!/outside the workspace|outside the configured roots|not a directory|not a file|ENOENT/.test(message)) {
      return error
    }
    const workspace = currentWorkspace()
    return new Error(`${message} · 当前工作区: ${workspace.cwd}`
      + '（面板 → 设置 → 自动检测 / 使用当前工作区）')
  }

  const runner = createRunner({
    spawn: (spec) => ctx.subprocess.spawn(spec),
    config: effectiveConfig
  })

  const runTool = async (args) => {
    const config = await effectiveConfig()
    const code = typeof args.code === 'string' ? args.code : undefined
    const file = typeof args.file === 'string' ? args.file : undefined
    if ((code === undefined || code.trim() === '') && (file === undefined || file.trim() === '')) {
      throw new Error('provided neither `code` nor `file`')
    }
    const request = code !== undefined && code.trim() !== ''
      ? { code, name: args.name }
      : { path: scriptPathFrom(config, file) }
    const result = await runner.runToCompletion(request)
    const console = [result.output, result.error].filter((part) => part !== undefined && part !== '').join('\n').trim()
    return {
      status: result.status,
      exitCode: result.exitCode ?? null,
      timedOut: result.timedOut === true,
      scriptPath: result.scriptPath,
      console
    }
  }

  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() => toolCtx.tools.register(defineTool({
      name: 'matlab_run',
      description: 'Run MATLAB (.m) code or a .m file on this machine and return its console output. '
        + 'Pass `code` for an inline snippet (written to <workdir>/.dsh-matlab-runner/) or `file` for an existing '
        + 'script path, absolute or relative to the configured MATLAB workdir. By default the plugin reuses one '
        + 'persistent MATLAB session, so runs are fast after the first one and figure windows really open on the '
        + 'desktop. That session is shared with the human user: keep snippets short and self-contained, and prefer '
        + '`exportgraphics`/`print` when the figure must be read back as an image.',
      parameters: {
        code: { type: 'string', description: 'Inline MATLAB source to run (preferred for short snippets).' },
        file: { type: 'string', description: 'Path of an existing .m file, absolute or relative to the configured MATLAB workdir.' },
        name: { type: 'string', description: 'Optional file name stem used when writing inline code to disk.' }
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }]
      },
      timeoutMs: 660000,
      async execute(args) {
        const result = await runTool(args ?? {})
        const head = [
          `status: ${result.status}`,
          `exit: ${result.exitCode === null ? 'n/a' : result.exitCode}${result.timedOut ? ' (timed out)' : ''}`,
          `script: ${result.scriptPath}`
        ].join(' \u00b7 ')
        return result.console === '' ? head : `${head}\n--- MATLAB console ---\n${result.console}`
      }
    })), 'dsh-matlab-runner: matlab_run tool')
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/matlab/api',
    async handler(request, response) {
      const route = suffixOf(request.url)
      // The panel reports its session's folder on every call; adopt it first.
      activate(queryParam(request.url, 'cwd'))
      try {
        if (request.method === 'GET' && route === 'state') {
          const [probe, config] = await Promise.all([runner.probe(), effectiveConfig()])
          return sendJson(response, 200, {
            ok: true,
            value: { ...probe, config, defaults: defaultConfig(), detected: config.detected }
          })
        }
        if (request.method === 'GET' && route === 'config') {
          return sendJson(response, 200, { ok: true, value: await effectiveConfig() })
        }
        if (request.method === 'POST' && route === 'config') {
          const patch = await readJson(request)
          const saved = await saveConfig(patch)
          const config = await effectiveConfig()
          return sendJson(response, 200, {
            ok: true,
            value: { ...(await runner.probe()), config, saved, detected: config.detected }
          })
        }
        if (request.method === 'POST' && route === 'run') {
          const body = await readJson(request)
          let code = typeof body.code === 'string' ? body.code : ''
          let name = body.name
          // `{ path }` = the buffer is a real file: run it in place, so relative
          // paths (`readmatrix('data.xlsx')`) resolve next to that file.
          let path = typeof body.path === 'string' && body.path.trim() !== '' ? body.path : undefined
          // `{ file: 'demo.m' }` runs a script that already lives in workdir/scriptDir.
          if (path === undefined && code.trim() === '' && typeof body.file === 'string' && body.file.trim() !== '') {
            const script = await runner.readScript(body.file)
            code = script.code
            name = name ?? script.name
            path = script.path
          }
          return sendJson(response, 200, { ok: true, value: await runner.start({ code, name, path }) })
        }
        if (request.method === 'GET' && route === 'poll') {
          const id = queryParam(request.url, 'id')
          const value = runner.poll(id)
          return value === undefined
            ? sendJson(response, 200, failure(new Error(`unknown run ${id}`)))
            : sendJson(response, 200, { ok: true, value })
        }
        if (request.method === 'POST' && route === 'stop') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runner.stop(body.id) })
        }
        if (request.method === 'POST' && route === 'save') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runner.save({ code: body.code, name: body.name }) })
        }
        if (request.method === 'GET' && route === 'tree') {
          return sendJson(response, 200, { ok: true, value: await runner.listDirectory(queryParam(request.url, 'path')) })
        }
        if (request.method === 'GET' && route === 'vars') {
          return sendJson(response, 200, { ok: true, value: await runner.variables(queryParam(request.url, 'force') === '1') })
        }
        if (request.method === 'GET' && route === 'scripts') {
          return sendJson(response, 200, { ok: true, value: { scripts: await runner.scripts() } })
        }
        if (request.method === 'GET' && route === 'script') {
          return sendJson(response, 200, { ok: true, value: await runner.readScript(queryParam(request.url, 'path')) })
        }
        if (request.method === 'GET' && route === 'stat') {
          return sendJson(response, 200, { ok: true, value: await runner.statPath(queryParam(request.url, 'path')) })
        }
        if (request.method === 'POST' && route === 'script') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runner.save({ code: body.code, name: body.name }) })
        }
        if (request.method === 'GET' && route === 'mlx') {
          const { parseMlx } = await import('./livemd.js')
          const file = await runner.resolve(queryParam(request.url, 'path'))
          const parsed = await parseMlx(file)
          const images = (parsed.images ?? []).map((image) => ({
            name: image.name,
            mime: image.mime,
            size: image.bytes.length,
            dataUrl: `data:${image.mime};base64,${image.bytes.toString('base64')}`
          }))
          return sendJson(response, 200, { ok: true, value: { ...parsed, images } })
        }
        if (request.method === 'POST' && route === 'file') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runner.writeText({ path: body.path, code: body.code }) })
        }
        if (request.method === 'POST' && route === 'session/restart') {
          await runner.restartSession()
          return sendJson(response, 200, { ok: true, value: runner.sessionStatus() })
        }
        if (request.method === 'POST' && route === 'session/stop') {
          runner.dispose()
          return sendJson(response, 200, { ok: true, value: runner.sessionStatus() })
        }
        if (request.method === 'GET' && route === 'artifact') {
          const payload = await runner.artifactPayload(queryParam(request.url, 'path'))
          response.writeHead(200, {
            'content-type': payload.type,
            'content-length': payload.bytes.length,
            'cache-control': 'no-store'
          })
          response.end(payload.bytes)
          return
        }
        if (request.method === 'GET' && route === 'roots') {
          return sendJson(response, 200, { ok: true, value: await runner.roots() })
        }
        if (request.method === 'POST' && route === 'roots') {
          const body = await readJson(request)
          const value = body.action === 'remove'
            ? await runner.removeRoot(body.path)
            : await runner.addRoot(body.path)
          return sendJson(response, 200, { ok: true, value, config: await effectiveConfig() })
        }
        if (request.method === 'GET' && route === 'var') {
          return sendJson(response, 200, { ok: true, value: await runner.readVariable(queryParam(request.url, 'name')) })
        }
        if (request.method === 'POST' && route === 'var') {
          const body = await readJson(request)
          return sendJson(response, 200, { ok: true, value: await runner.writeVariable({ name: body.name, text: body.text }) })
        }
        if (request.method === 'GET' && route === 'artifacts') {
          const since = Number(queryParam(request.url, 'since'))
          return sendJson(response, 200, {
            ok: true,
            value: { artifacts: await runner.artifacts(Number.isFinite(since) ? since : undefined) }
          })
        }
        return sendJson(response, 404, failure(new Error(`no route ${request.method} ${route}`)))
      } catch (error) {
        return sendJson(response, 500, failure(explain(error)))
      }
    }
  }), 'dsh-matlab-runner: /matlab/api routes')

  ctx.effect(() => () => runner.dispose(), 'dsh-matlab-runner: persistent MATLAB session lifecycle')

  ctx.effect(() => {
    const timer = setInterval(() => runner.prune(), 300_000)
    if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref()
    return () => clearInterval(timer)
  }, 'dsh-matlab-runner: run registry pruning')
}
