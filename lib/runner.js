/**
 * Host half of dsh-matlab-runner: preset config (paths), MATLAB invocation,
 * and the process/run registry the /matlab/api/* routes expose.
 *
 * Two execution modes:
 *  - `session` (default): one long-lived `matlab -nodesktop -nosplash` process
 *    fed through stdin. A run costs milliseconds once the session is warm, and
 *    because the process keeps its display, figure windows really open.
 *  - `batch`: `matlab -batch` per run, headless, exits with the script. Slower
 *    (one cold start each time) but leaves no process behind.
 *
 * Zero runtime dependencies on purpose — this package is installed into a
 * profile as a link, so it may only import node builtins.
 * @module dsh-matlab-runner/runner
 */
import { spawn as spawnProcess } from 'node:child_process'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

/** Bounded collected output per stream (bytes). */
const OUTPUT_CAP_BYTES = 4 * 1024 * 1024

/** Sentinel marker MATLAB prints after a command finishes. */
const SENTINEL = '<<<DSH_MATLAB_END>>>'

/** A first-run banner can be long; boot waits this long for the prompt. */
const BOOT_TIMEOUT_MS = 240_000

/** Where the preset config lives (stable across profile reinstalls). */
export function configPath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'matlab-runner.json')
}

/** Preset written on first boot; every field is editable from the panel. */
export function defaultConfig() {
  const workspace = join(homedir(), 'Documents', 'deepseek-harness', 'default-workspace')
  return {
    // `session` keeps one MATLAB alive; `batch` starts one process per run.
    mode: 'session',
    // Initialize the desktop/graphics stack right after boot: the first figure
    // then opens in ~2s instead of ~20s, at the cost of a slower first run.
    warmFigures: false,
    // Write the buffer back to disk after every successful run (IDE-style).
    autoSave: true,
    // Follow the workspace the session has open, instead of a frozen path.
    autoDetect: true,
    matlabPath: '/Applications/MATLAB_R2026a.app/bin/matlab',
    sessionArgs: ['-nodesktop', '-nosplash'],
    extraArgs: ['-nodisplay', '-nosplash'],
    workdir: workspace,
    scriptDir: join(workspace, 'matlab'),
    // Extra folders mounted in the tree next to the workspace, like MATLAB's
    // "add to path" list. They are readable/editable but never the run cwd.
    extraRoots: [],
    timeoutMs: 600000,
    env: {}
  }
}

/** Read the preset config, creating it with defaults when absent. */
export async function loadConfig() {
  const file = configPath()
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return normalizeConfig(parsed)
  } catch {
    const fresh = defaultConfig()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(fresh, null, 2) + '\n', 'utf8')
    return fresh
  }
}

/** Persist a config patch and return the normalized result. */
export async function saveConfig(patch) {
  const next = normalizeConfig({ ...(await loadConfig()), ...(patch || {}) })
  await mkdir(dirname(configPath()), { recursive: true })
  await writeFile(configPath(), JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

/** Coerce persisted values, keeping defaults for empty/absent fields. */
export function normalizeConfig(raw) {
  const defaults = defaultConfig()
  const value = raw && typeof raw === 'object' ? raw : {}
  const str = (key) => {
    const v = value[key]
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : defaults[key]
  }
  const strList = (key) => (Array.isArray(value[key])
    ? value[key].filter((item) => typeof item === 'string')
    : defaults[key])
  const env = value.env && typeof value.env === 'object' ? value.env : {}
  const timeoutMs = Number.isFinite(value.timeoutMs) && value.timeoutMs > 0
    ? Math.min(Math.floor(value.timeoutMs), 3_600_000)
    : defaults.timeoutMs
  return {
    mode: value.mode === 'batch' ? 'batch' : 'session',
    warmFigures: value.warmFigures === true,
    autoSave: value.autoSave !== false,
    autoDetect: value.autoDetect !== false,
    matlabPath: str('matlabPath'),
    sessionArgs: strList('sessionArgs'),
    extraArgs: strList('extraArgs'),
    workdir: str('workdir'),
    scriptDir: str('scriptDir'),
    extraRoots: strList('extraRoots').map((item) => item.trim()).filter((item) => item !== ''),
    timeoutMs,
    env
  }
}

/**
 * Point `workdir`/`scriptDir` at a detected workspace root.
 *
 * @param config - normalized config.
 * @param detected - `{ cwd, source }` when a workspace was detected, `undefined`
 *   to keep the configured paths (manual mode).
 * @returns config with the effective paths and a `detected` breadcrumb.
 */
export function withDetectedWorkspace(config, detected) {
  if (config.autoDetect === false || detected === undefined || typeof detected.cwd !== 'string') {
    return { ...config, detected: { source: 'config', cwd: config.workdir } }
  }
  const cwd = detected.cwd
  return {
    ...config,
    workdir: cwd,
    scriptDir: join(cwd, 'matlab'),
    detected: { source: detected.source ?? 'session', cwd, error: detected.error }
  }
}

/** The file name a save/run submission uses, sanitized to a bare .m name. */
export function scriptFileName(input, fallbackPrefix = 'run') {
  const raw = typeof input === 'string' ? input.trim() : ''
  const base = raw.replace(/[\\/]/g, '').replace(/\.m$/i, '')
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[^A-Za-z]+/, '')
  if (safe === '') {
    return `${fallbackPrefix}_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`
  }
  return safe
}

/** MATLAB single-quote escaping for a path inside a command. */
function quoteM(path) {
  return path.replace(/'/g, "''")
}

/** Scratch directory inside the workdir (scripts, vars snapshot). */
export function scratchDir(config) {
  return join(config.workdir, '.dsh-matlab-runner')
}

/** Extensions the panel opens as text; anything else is shown as binary. */
const TEXT_EXT = new Set([
  '.m', '.mlx', '.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml',
  '.log', '.dat', '.ini', '.cfg', '.conf', '.sh', '.py', '.c', '.h', '.cpp',
  '.hpp', '.tex', '.bib', '.html', '.css', '.js', '.sql'
])

/** Whether the panel should offer this file to the editor. */
export function isEditableFile(name) {
  return TEXT_EXT.has(extname(name).toLowerCase())
}

/**
 * Build the argv for one batch run.
 * -batch exits when the script finishes; the try/catch prints a full report and
 * sets a non-zero exit code, mirroring what `mrun` does in a shell.
 * @param config - normalized config.
 * @param scriptPath - absolute path of the .m file.
 */
export function batchArgv(config, scriptPath) {
  const body = [
    `try, run('${quoteM(scriptPath)}');`,
    `catch e, disp(getReport(e, 'extended', 'hyperlinks', 'off'));`,
    "exit(1); end"
  ].join(' ')
  return [...[config.matlabPath], ...config.extraArgs, '-batch', body]
}

/**
 * The line one session run types into the persistent MATLAB prompt.
 * The two markers tell the host whether the script threw. `run` leaves the
 * prompt in the script's folder, so the line ends by cd-ing back to `workdir`.
 * @param scriptPath - absolute path of the .m file.
 * @param marker - unique marker prefix for this command.
 * @param workdir - folder the session should return to afterwards.
 */
export function sessionCommandLine(scriptPath, marker, workdir) {
  const body = [
    `try, run('${quoteM(scriptPath)}');`,
    `fprintf('\\n${marker}:OK\\n');`,
    `catch e, disp(getReport(e, 'extended', 'hyperlinks', 'off'));`,
    `fprintf('\\n${marker}:ERR\\n');`,
    'end'
  ].join(' ')
  return typeof workdir === 'string' && workdir !== ''
    ? `${body}; cd('${quoteM(workdir)}')`
    : body
}

/** Strip MATLAB prompt echoes and blank edges from a captured chunk. */
export function cleanConsoleText(raw) {
  if (typeof raw !== 'string' || raw === '') return ''
  // Warnings arrive wrapped in literal `[\b … ]\b` control sequences.
  const unwrapped = raw.replace(/\[\u0008/g, '').replace(/\]\u0008/g, '').replace(/\u0008/g, '')
  const lines = unwrapped.replace(/\r\n?/g, '\n').split('\n')
  const kept = []
  for (const line of lines) {
    const trimmed = line.trim()
    // A bare prompt is the REPL asking for the next command, not output.
    if (trimmed === '>>' || trimmed === '>> ' || trimmed === '') continue
    kept.push(line.replace(/^(?:>>\s*)+/, ''))
  }
  return kept.join('\n').trim()
}

/**
 * Absolute path only when it stays inside one of the configured roots.
 * A relative path is looked up next to the workdir first, then in scriptDir, so
 * `script?path=demo_plot.m` finds a saved script without the full path.
 */
export function insideRoots(config, raw) {
  const value = String(raw ?? '').trim()
  if (value === '') throw new Error('missing path')
  let abs
  if (value.startsWith('/')) {
    abs = resolve(value)
  } else {
    const inWorkdir = resolve(config.workdir, value)
    const inScriptDir = resolve(config.scriptDir, value)
    abs = existsSync(inWorkdir) || !existsSync(inScriptDir) ? inWorkdir : inScriptDir
  }
  const roots = [resolve(config.workdir), resolve(config.scriptDir),
    ...(config.extraRoots ?? []).map((root) => resolve(root))]
  const allowed = roots.some((root) => abs === root || abs.startsWith(root + sep))
  if (!allowed) throw new Error(`path outside the configured roots: ${abs}`)
  return abs
}

/** Model scripts available in scriptDir, newest first. */
export async function listScripts(config) {
  let entries
  try {
    entries = await readdir(config.scriptDir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.m$/i.test(entry.name)) continue
    const abs = join(config.scriptDir, entry.name)
    const info = await stat(abs).catch(() => undefined)
    files.push({
      name: entry.name.replace(/\.m$/i, ''),
      file: entry.name,
      path: abs,
      mtimeMs: info?.mtimeMs ?? 0,
      size: info?.size ?? 0
    })
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

/** One directory listing for the panel's file tree. */
export async function listDirectory(config, raw) {
  const value = String(raw ?? '').trim()
  const abs = value === '' ? resolve(config.workdir) : insideRoots(config, value)
  const info = await stat(abs).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new Error(`not a directory: ${abs}`)
  const entries = await readdir(abs, { withFileTypes: true })
  const items = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const child = join(abs, entry.name)
    const childInfo = await stat(child).catch(() => undefined)
    if (childInfo === undefined) continue
    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: child, type: 'dir', mtimeMs: childInfo.mtimeMs })
    } else if (entry.isFile()) {
      items.push({
        name: entry.name,
        path: child,
        type: 'file',
        size: childInfo.size,
        mtimeMs: childInfo.mtimeMs,
        editable: isEditableFile(entry.name)
      })
    }
  }
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  const root = resolve(config.workdir)
  const mounts = [root, ...(config.extraRoots ?? []).map((mount) => resolve(mount))]
  return {
    root,
    path: abs,
    parent: mounts.includes(abs) ? null : dirname(abs),
    entries: items
  }
}

/**
 * Mounted folders shown in the tree: the workspace first, then extras.
 * @returns `[{ path, name, kind: 'workspace'|'script'|'extra' }]` without duplicates.
 */
export function rootsFor(config) {
  const seen = new Set()
  const roots = []
  const push = (raw, kind) => {
    const abs = resolve(raw)
    if (seen.has(abs)) return
    seen.add(abs)
    roots.push({ path: abs, name: basename(abs) || abs, kind })
  }
  push(config.workdir, 'workspace')
  push(config.scriptDir, 'script')
  for (const extra of config.extraRoots ?? []) {
    if (existsSync(extra)) push(extra, 'extra')
  }
  return roots
}

/** Absolute folder for a mount request; `~` expands, relative paths use workdir. */
export function resolveRoot(config, raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') throw new Error('empty folder path')
  const expanded = text.startsWith('~') ? join(homedir(), text.slice(1)) : text
  return resolve(config.workdir, expanded)
}

/** Non-mutating helper: config with `folder` added to `extraRoots`. */
export function withExtraRoot(config, folder) {
  const abs = resolveRoot(config, folder)
  const info = statSyncSafe(abs)
  if (info === undefined || !info.isDirectory()) throw new Error(`not a folder: ${abs}`)
  const next = [...new Set([...(config.extraRoots ?? []).map((item) => resolve(item)), abs])]
  return { ...config, extraRoots: next }
}

/** Non-mutating helper: config with `folder` removed from `extraRoots`. */
export function withoutExtraRoot(config, folder) {
  const abs = resolveRoot(config, folder)
  return { ...config, extraRoots: (config.extraRoots ?? []).map((item) => resolve(item)).filter((item) => item !== abs) }
}

function statSyncSafe(path) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

/**
 * Image-like files the panel can preview, newest first.
 * @param config - normalized config.
 * @param sinceMs - only files touched at/after this timestamp (run start).
 */
export async function findArtifacts(config, sinceMs) {
  const found = []
  // A scratch script lives in `.dsh-matlab-runner`, and `run` leaves MATLAB in
  // the script's folder, so pwd-relative exports land there too.
  const roots = [config.workdir, config.scriptDir, join(config.workdir, '.dsh-matlab-runner')]
  for (const dir of roots) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(png|jpe?g|svg|gif|webp)$/i.test(entry.name)) continue
      const abs = join(dir, entry.name)
      const info = await stat(abs).catch(() => undefined)
      if (info === undefined) continue
      if (typeof sinceMs === 'number' && info.mtimeMs < sinceMs - 2000) continue
      found.push({ path: abs, name: entry.name, dir, mtimeMs: info.mtimeMs, size: info.size })
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return found.slice(0, 12)
}

/**
 * Signal the MATLAB process group (falls back to the direct child handle).
 * Killing the group matters: the macOS launcher is a shell wrapper and MATLAB
 * spawns helpers that would otherwise outlive the session.
 */
function signalGroup(pid, handle, signal) {
  if (typeof pid === 'number' && process.platform !== 'win32') {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      /* fall through to the handle */
    }
  }
  try {
    handle?.kill(signal)
  } catch {
    /* already gone */
  }
}

/**
 * The persistent MATLAB process: one REPL fed through stdin.
 * Every command ends by printing a unique marker, which is how output is
 * delimited without a PTY.
 */
export function createSession(options) {
  const { config } = options
  /** @type {{ handle?: any, pid?: number, buffer: string, exited?: any, error?: string, startedAt?: number }} */
  const state = { buffer: '' }
  let chain = Promise.resolve()
  /** Commands waiting for their marker; killed with the process. */
  const inflight = new Set()

  const append = (chunk) => {
    state.buffer += chunk
    // Long scripts can print a lot; keep a moving window, not the whole history.
    if (state.buffer.length > 2_000_000) state.buffer = state.buffer.slice(-1_000_000)
  }

  function kill() {
    const handle = state.handle
    const pid = state.pid
    state.handle = undefined
    state.pid = undefined
    state.exited = undefined
    // Anything waiting for a marker will never see one: fail it now instead of
    // letting its guard timer run for the whole timeout.
    for (const abort of [...inflight]) {
      try {
        abort(new Error('MATLAB 会话已停止 / session stopped'))
      } catch {
        /* the waiter is already gone */
      }
    }
    inflight.clear()
    if (handle === undefined) return
    // Graceful first: `exit` makes MATLAB shut down its own launcher and helper
    // processes. Signals alone leave the daemonised -mpasessionid child behind,
    // because the launcher can start it in another process group.
    try {
      handle.stdin?.write('exit\n')
    } catch {
      /* stdin already closed */
    }
    const term = setTimeout(() => signalGroup(pid, handle, 'SIGTERM'), 1200)
    const killTimer = setTimeout(() => signalGroup(pid, handle, 'SIGKILL'), 4000)
    for (const timer of [term, killTimer]) {
      if (typeof timer.unref === 'function') timer.unref()
    }
  }

  async function start() {
    const cfg = await config()
    if (!existsSync(cfg.matlabPath)) throw new Error(`MATLAB not found at ${cfg.matlabPath}`)
    kill()
    state.buffer = ''
    state.exited = undefined
    state.error = undefined
    state.startedAt = Date.now()
    const argv = Array.isArray(cfg.sessionArgs) && cfg.sessionArgs.length > 0
      ? cfg.sessionArgs
      : ['-nodesktop', '-nosplash']
    const handle = spawnProcess(cfg.matlabPath, argv, {
      cwd: cfg.workdir,
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group: the macOS launcher is a shell that execs the real
      // binary, and grandchildren (ServiceHost, workers) must die with it too.
      detached: process.platform !== 'win32'
    })
    state.handle = handle
    state.pid = handle.pid
    handle.stdout.setEncoding('utf8')
    handle.stderr.setEncoding('utf8')
    handle.stdout.on('data', append)
    handle.stderr.on('data', append)
    handle.on('error', (error) => {
      state.error = String(error?.message ?? error)
    })
    handle.on('exit', (code, signal) => {
      state.exited = { code, signal }
      state.handle = undefined
      state.pid = undefined
    })
    return handle.pid
  }

  /** Write one line and wait for `marker:OK`/`marker:ERR`. */
  function send(line, marker, timeoutMs) {
    return new Promise((resolveText, reject) => {
      const handle = state.handle
      if (handle === undefined || state.exited !== undefined) {
        reject(new Error('MATLAB 会话未运行 / session is not running'))
        return
      }
      const from = state.buffer.length
      const startedAt = Date.now()
      /** Tear the waiter down exactly once (marker, timeout, stop, write error). */
      const settle = () => {
        clearInterval(timer)
        clearTimeout(guard)
        inflight.delete(abort)
      }
      const abort = (error) => {
        settle()
        reject(error)
      }
      inflight.add(abort)
      const timer = setInterval(() => {
        const ready = state.buffer.indexOf(`${marker}:`, from)
        if (ready !== -1) {
          settle()
          const ok = state.buffer.slice(ready + marker.length + 1, ready + marker.length + 3) === 'OK'
          resolveText({
            text: cleanConsoleText(state.buffer.slice(from, ready)),
            raw: state.buffer.slice(from, ready),
            ok,
            ms: Date.now() - startedAt
          })
        }
      }, 12)
      const guard = setTimeout(() => {
        abort(new Error('MATLAB 会话超时 / session command timed out'))
      }, Math.max(1000, timeoutMs))
      try {
        handle.stdin.write(`${line}\n`)
      } catch (error) {
        abort(error)
      }
    })
  }

  /** Boot if needed; the first command absorbs the startup banner. */
  async function ensure() {
    if (state.handle !== undefined && state.exited === undefined) return
    const cfg = await config()
    await start()
    const marker = `M${Math.random().toString(36).slice(2, 10)}`
    await send(`fprintf('${marker}:OK\\n')`, marker, BOOT_TIMEOUT_MS)
    if (cfg.warmFigures === true) {
      // Touching a figure initializes Java/the desktop stack; pay it up front.
      const warm = `M${Math.random().toString(36).slice(2, 10)}`
      await send(`try, f = figure('Visible', 'off'); close(f); catch, end; fprintf('\\n${warm}:OK\\n')`, warm, 180_000)
    }
  }

  return {
    status() {
      return {
        running: state.handle !== undefined && state.exited === undefined,
        pid: state.pid,
        startedAt: state.startedAt,
        error: state.error,
        buffer: state.handle === undefined ? '' : state.buffer.slice(-4000)
      }
    },
    /** Live tail while a script runs (offset into the stream buffer). */
    tail(from) {
      if (typeof from !== 'number') return ''
      return cleanConsoleText(state.buffer.slice(from))
    },
    bootOffset() {
      return state.buffer.length
    },
    ensure,
    async run(scriptPath, timeoutMs, workdir) {
      chain = chain.then(async () => {
        await ensure()
        const marker = `M${Math.random().toString(36).slice(2, 10)}`
        const from = state.buffer.length
        const outcome = await send(sessionCommandLine(scriptPath, marker, workdir), marker, timeoutMs)
        return { ...outcome, streamOffset: from }
      })
      // A failed link must not poison the chain for later commands.
      const result = chain.catch((error) => {
        chain = Promise.resolve()
        throw error
      })
      return result
    },
    restart: start,
    stop: kill,
    dispose: kill
  }
}

/**
 * Run registry + MATLAB launcher.
 * @param options - { spawn(spec) -> handle, config(): Promise<config> } where the
 *   handle carries { done, collected: { stdout, stderr }, terminate() } — the
 *   ctx.subprocess contract. `spawn` is only used by batch mode.
 */
export function createRunner(options) {
  const { spawn, config } = options
  /** @type {Map<string, any>} */
  const runs = new Map()
  let counter = 0
  /** Last `whos` snapshot: { at, value }. */
  let varsCache
  const session = createSession({ config })

  const text = (stream) => {
    try {
      return stream?.readFrom(0)?.text ?? ''
    } catch {
      return ''
    }
  }

  /**
   * Explain the classic MATLAB trap: a relative data path is resolved against
   * the folder of the script that is running, not the workspace root.
   */
  function pathHint(run) {
    const text = `${run.output ?? ''}\n${run.error ?? ''}`
    if (!/找不到或无法打开|无法打开|Cannot open|No such file|未找到|not found/i.test(text)) return ''
    const dir = dirname(run.scriptPath)
    if (dir.endsWith('.dsh-matlab-runner')) {
      return '这是还没保存的草稿，运行目录是临时目录 · 数据文件请用绝对路径，或先把脚本保存到数据文件所在的文件夹'
    }
    return `相对路径以脚本所在目录为基准: ${dir}（数据文件放这里，或用绝对路径）`
  }

  function snapshot(run) {
    if (run.mode === 'session') {
      const live = run.status === 'running' || run.status === 'stopping'
      const tail = live ? session.tail(run.streamFrom) : ''
      return {
        id: run.id,
        mode: 'session',
        status: run.status,
        output: tail === '' ? run.output : tail,
        error: run.error ?? '',
        exitCode: run.exitCode,
        signal: run.signal,
        elapsedMs: Date.now() - run.startedAt,
        scriptPath: run.scriptPath,
        timedOut: run.timedOut === true,
        hint: pathHint(run) || undefined,
        artifacts: run.artifacts ?? []
      }
    }
    const stdout = text(run.handle?.collected?.stdout)
    const stderr = text(run.handle?.collected?.stderr)
    return {
      id: run.id,
      mode: 'batch',
      status: run.status,
      output: stdout === '' ? (run.output ?? '') : stdout,
      error: stderr === '' ? (run.error ?? '') : stderr,
      exitCode: run.exitCode,
      signal: run.signal,
      elapsedMs: Date.now() - run.startedAt,
      scriptPath: run.scriptPath,
      timedOut: run.timedOut === true,
      hint: pathHint(run) || undefined,
      artifacts: run.artifacts ?? []
    }
  }

  async function prepareScript(code, name, rawPath) {
    const cfg = await config()
    // A buffer that already lives in the workspace runs from its own folder, so
    // relative paths (`readmatrix('data.xlsx')`) resolve next to the script.
    if (typeof rawPath === 'string' && rawPath.trim() !== '') {
      const target = insideRoots(cfg, rawPath)
      const source = code.trim() === ''
        ? await readFile(target, 'utf8')
        : (await mkdir(dirname(target), { recursive: true }),
           await writeFile(target, code.endsWith('\n') ? code : code + '\n', 'utf8'),
           code)
      return { cfg, scriptPath: target, source }
    }
    const dir = join(cfg.workdir, '.dsh-matlab-runner')
    await mkdir(dir, { recursive: true })
    const base = scriptFileName(name)
    const scriptPath = join(dir, `${base}.m`)
    await writeFile(scriptPath, code.endsWith('\n') ? code : code + '\n', 'utf8')
    return { cfg, scriptPath }
  }

  /** Session mode: one persistent MATLAB, output streamed from its buffer. */
  async function startSession(request, cfg, scriptPath, run) {
    run.mode = 'session'
    run.streamFrom = session.bootOffset()
    try {
      await session.ensure()
      run.streamFrom = session.bootOffset()
      const outcome = await session.run(scriptPath, cfg.timeoutMs, cfg.workdir)
      run.output = outcome.text
      run.status = outcome.ok ? 'exited' : 'failed'
      run.exitCode = outcome.ok ? 0 : 1
      run.elapsed = outcome.ms
    } catch (error) {
      const message = String(error?.message ?? error)
      if (run.stopped !== true) {
        run.timedOut = /超时|timed out/.test(message)
        run.status = 'failed'
        run.exitCode = null
        run.signal = message
        run.error = message
      }
      session.stop()
    }
    run.artifacts = await findArtifacts(cfg, run.startedAt)
    return snapshot(run)
  }

  async function startBatch(cfg, scriptPath, run) {
    run.mode = 'batch'
    const controller = new AbortController()
    run.abort = () => controller.abort()

    const timer = setTimeout(() => {
      run.timedOut = true
      try {
        controller.abort()
        run.handle?.terminate?.()
      } catch {
        /* already gone */
      }
    }, cfg.timeoutMs)
    run.timer = timer

    try {
      run.handle = spawn({
        argv: batchArgv(cfg, scriptPath),
        cwd: cfg.workdir,
        env: cfg.env,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: OUTPUT_CAP_BYTES },
          stderr: { maxBytes: OUTPUT_CAP_BYTES }
        },
        graceMs: 8000,
        signal: controller.signal
      })
      run.handle.done.then(
        async (outcome) => {
          clearTimeout(timer)
          run.status = 'exited'
          run.exitCode = outcome?.exitCode ?? null
          run.signal = outcome?.signal ?? null
          run.artifacts = await findArtifacts(cfg, run.startedAt)
        },
        (error) => {
          clearTimeout(timer)
          run.status = 'failed'
          run.exitCode = null
          run.signal = String(error?.message ?? error)
        }
      )
      return snapshot(run)
    } catch (error) {
      clearTimeout(timer)
      run.status = 'failed'
      run.exitCode = null
      run.signal = String(error?.message ?? error)
      run.spawnError = String(error?.message ?? error)
      return snapshot(run)
    }
  }

  return {
    /** Start one run; resolves with the run snapshot identity. */
    async start(request = {}) {
      const code = typeof request.code === 'string' ? request.code : ''
      const rawPath = typeof request.path === 'string' && request.path.trim() !== '' ? request.path : undefined
      if (code.trim() === '' && rawPath === undefined) throw new Error('empty MATLAB code')
      const { cfg, scriptPath } = await prepareScript(code, request.name, rawPath)

      const id = `run-${Date.now().toString(36)}-${++counter}`
      const run = {
        id,
        status: 'running',
        startedAt: Date.now(),
        scriptPath,
        exitCode: undefined,
        signal: undefined,
        timedOut: false,
        output: '',
        error: ''
      }
      runs.set(id, run)
      if (cfg.mode === 'batch') return startBatch(cfg, scriptPath, run)
      // Session runs are awaited by the caller that polls; kick it off first so
      // the snapshot can be returned immediately.
      run.pending = startSession(request, cfg, scriptPath, run)
      return snapshot(run)
    },

    /** Current state of one run (polled by the panel). */
    poll(id) {
      const run = runs.get(id)
      if (run === undefined) return undefined
      const state = snapshot(run)
      if (run.spawnError !== undefined) state.spawnError = run.spawnError
      return state
    },

    /** Stop a running process; in session mode this restarts the REPL. */
    async stop(id) {
      const run = runs.get(id)
      if (run === undefined) return undefined
      if (run.status === 'running' || run.status === 'stopping') {
        run.status = 'stopping'
        if (run.mode === 'session') {
          run.stopped = true
          session.stop()
          run.status = 'failed'
          run.error = '已中断（MATLAB 会话已重启）/ interrupted, session restarted'
          run.exitCode = null
          const cfg = await config()
          run.artifacts = await findArtifacts(cfg, run.startedAt)
        } else {
          try {
            run.abort?.()
            run.handle?.terminate?.()
          } catch {
            /* already gone */
          }
        }
      }
      return snapshot(run)
    },

    /** Wait for completion (agent tool path). */
    async wait(id) {
      const run = runs.get(id)
      if (run === undefined) return undefined
      if (run.pending !== undefined) {
        try {
          await run.pending
        } catch {
          /* recorded on the run */
        }
      }
      try {
        await run.handle?.done
      } catch {
        /* recorded on the run */
      }
      return snapshot(run)
    },

    /** Run to completion and return the final snapshot. */
    async runToCompletion(request = {}) {
      const started = await this.start(request)
      const finished = await this.wait(started.id)
      return finished
    },

    /** Forget finished runs (bounded memory). */
    prune() {
      const now = Date.now()
      for (const [id, run] of runs) {
        if (run.status !== 'running' && run.status !== 'stopping' && now - run.startedAt > 3_600_000) {
          runs.delete(id)
        }
      }
    },

    /** Save editor content as a real .m file under scriptDir. */
    async save(request = {}) {
      const cfg = await config()
      const code = typeof request.code === 'string' ? request.code : ''
      if (code.trim() === '') throw new Error('empty MATLAB code')
      const base = scriptFileName(request.name)
      await mkdir(cfg.scriptDir, { recursive: true })
      const target = join(cfg.scriptDir, `${base}.m`)
      await writeFile(target, code.endsWith('\n') ? code : code + '\n', 'utf8')
      return { path: target }
    },

    /** Resolve a user-supplied path, refusing anything outside workdir/scriptDir. */
    async resolve(raw) {
      const cfg = await config()
      const text = typeof raw === 'string' ? raw.trim() : ''
      if (text === '') throw new Error('empty file path')
      const target = insideRoots(cfg, text)
      if (target === undefined) throw new Error(`outside the workspace: ${text}`)
      return target
    },

    /**
     * Write editor content back to an exact file inside workdir/scriptDir.
     * Unlike `save`, this keeps the file where it already lives.
     */
    async writeText(request = {}) {
      const cfg = await config()
      const raw = typeof request.path === 'string' ? request.path : ''
      if (raw.trim() === '') throw new Error('empty file path')
      const target = insideRoots(cfg, raw)
      if (target === undefined) throw new Error(`outside the workspace: ${raw}`)
      const code = typeof request.code === 'string' ? request.code : ''
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, code.endsWith('\n') ? code : code + '\n', 'utf8')
      const info = await stat(target)
      return { path: target, size: info.size, mtimeMs: info.mtimeMs }
    },

    /** MATLAB binary sanity facts for the panel header. */
    async probe() {
      const cfg = await config()
      return {
        mode: cfg.mode,
        matlabPath: cfg.matlabPath,
        matlabPresent: existsSync(cfg.matlabPath),
        workdir: cfg.workdir,
        workdirPresent: existsSync(cfg.workdir),
        scriptDir: cfg.scriptDir,
        timeoutMs: cfg.timeoutMs,
        extraArgs: cfg.extraArgs,
        sessionArgs: cfg.sessionArgs,
        configPath: configPath(),
        resolvedWorkdir: resolve(cfg.workdir),
        session: session.status()
      }
    },

    /** Kill the persistent session (panel button / unload). */
    restartSession: () => session.restart(),

    /** Whether the session is alive. */
    sessionStatus: () => session.status(),

    /** Release the persistent process. */
    dispose: () => session.dispose(),

    /** Previewable artifacts near a run start. */
    artifacts: async (sinceMs) => findArtifacts(await config(), sinceMs),

    /** Scripts in scriptDir. */
    scripts: async () => listScripts(await config()),

    /** One file's source (any text file under the roots). */
    async readScript(raw) {
      const cfg = await config()
      const abs = insideRoots(cfg, raw)
      const info = await stat(abs).catch(() => undefined)
      if (info === undefined || !info.isFile()) throw new Error(`not a file: ${abs}`)
      if (info.size > 4 * 1024 * 1024) throw new Error(`file is too large to edit (${info.size} bytes): ${abs}`)
      const bytes = await readFile(abs)
      if (bytes.includes(0)) throw new Error(`not a text file: ${abs}`)
      const file = abs.split(sep).pop() ?? ''
      return {
        path: abs,
        file,
        name: file.replace(/\.m$/i, ''),
        editable: isEditableFile(file),
        code: bytes.toString('utf8')
      }
    },

    /** The directory tree the panel browses. */
    listDirectory: async (raw) => listDirectory(await config(), raw),

    /**
     * Variables in the live session (`whos`), read back as JSON. MATLAB writes
     * the snapshot to a file, so the console formatting never has to be parsed.
     */
    async variables(force = false) {
      if (!force && varsCache !== undefined && Date.now() - varsCache.at < 400) return varsCache.value
      const cfg = await config()
      const status = session.status()
      const remember = (value) => {
        varsCache = { at: Date.now(), value }
        return value
      }
      if (status.running !== true) return remember({ vars: [], session: status })
      const dir = scratchDir(cfg)
      await mkdir(dir, { recursive: true })
      const outPath = join(dir, 'vars.json')
      const scriptPath = join(dir, 'dshVars.m')
      await rm(outPath, { force: true })
      const lines = [
        'v = whos;',
        'n = numel(v);',
        'names = {v.name}; classes = {v.class}; sizes = {v.size}; nbytes = {v.bytes};',
        'vals = cell(1, n);',
        'for k = 1:n',
        '  try',
        "    x = evalin('base', names{k});",
        "    if ischar(x) && isrow(x)",
        "      t = ['''' x ''''];",
        '    elseif (isnumeric(x) || islogical(x)) && numel(x) <= 10',
        '      t = mat2str(x, 4);',
        '    else',
        '      sz = size(x);',
        "      t = sprintf('%dx%d %s', sz(1), sz(2), classes{k});",
        '    end',
        '  catch',
        "    t = '';",
        '  end',
        '  if numel(t) > 60',
        "    t = [t(1:57) '...'];",
        '  end',
        '  vals{k} = t;',
        'end',
        's = struct("name", {v.name}, "cls", {v.class}, "size", {v.size}, "bytes", nbytes, "value", vals);',
        `f = fopen('${quoteM(outPath)}', 'w');`,
        'if f > 0',
        'fwrite(f, jsonencode(s));',
        'fclose(f);',
        'end'
      ]
      await writeFile(scriptPath, `${lines.join('\n')}\n`, 'utf8')
      try {
        await session.run(scriptPath, 30_000, cfg.workdir)
      } catch {
        /* a busy or dead session just reports what it has */
      }
      let parsed = []
      try {
        parsed = JSON.parse(await readFile(outPath, 'utf8'))
      } catch {
        parsed = []
      }
      return remember({ vars: Array.isArray(parsed) ? parsed : [], session: session.status() })
    },

    /** Folders mounted in the tree: workspace, script dir and extra roots. */
    async roots() {
      const cfg = await config()
      return { roots: rootsFor(cfg), workdir: resolve(cfg.workdir) }
    },

    /** Mount one more folder (persisted in the config file). */
    async addRoot(folder) {
      const cfg = await config()
      const next = withExtraRoot(cfg, folder)
      await saveConfig({ extraRoots: next.extraRoots })
      return { roots: rootsFor(next), workdir: resolve(next.workdir) }
    },

    /** Unmount a folder added with `addRoot`. */
    async removeRoot(folder) {
      const cfg = await config()
      const next = withoutExtraRoot(cfg, folder)
      await saveConfig({ extraRoots: next.extraRoots })
      return { roots: rootsFor(next), workdir: resolve(next.workdir) }
    },

    /** One variable's full text, for the double-click editor. */
    async readVariable(name) {
      const identifier = String(name ?? '').trim()
      if (!/^[A-Za-z]\w{0,62}$/.test(identifier)) throw new Error(`not a variable name: ${identifier}`)
      const cfg = await config()
      const status = session.status()
      if (status.running !== true) throw new Error('the MATLAB session is not running yet — run a script first')
      const dir = scratchDir(cfg)
      await mkdir(dir, { recursive: true })
      const outPath = join(dir, 'var.json')
      const scriptPath = join(dir, 'dshVarRead.m')
      await rm(outPath, { force: true })
      const lines = [
        `name = '${quoteM(identifier)}';`,
        'try',
        "  x = evalin('base', name);",
        '  info = struct("name", name, "cls", class(x), "size", size(x));',
        '  if isnumeric(x) || islogical(x)',
        '    t = mat2str(x, 6);',
        '  else',
        '    t = evalc("disp(x)");',
        '  end',
        '  if numel(t) > 40000',
        "    t = [t(1:40000) ' ...'];",
        '  end',
        '  info.text = t;',
        'catch e',
        '  info = struct("name", name, "error", e.message);',
        'end',
        `f = fopen('${quoteM(outPath)}', 'w');`,
        'if f > 0',
        'fwrite(f, jsonencode(info));',
        'fclose(f);',
        'end'
      ]
      await writeFile(scriptPath, `${lines.join('\n')}\n`, 'utf8')
      await session.run(scriptPath, 30_000, cfg.workdir)
      let parsed
      try {
        parsed = JSON.parse(await readFile(outPath, 'utf8'))
      } catch {
        throw new Error(`could not read the value of ${identifier}`)
      }
      if (parsed.error !== undefined) throw new Error(String(parsed.error))
      return {
        name: String(parsed.name ?? identifier),
        cls: String(parsed.cls ?? ''),
        size: Array.isArray(parsed.size) ? parsed.size : [],
        text: String(parsed.text ?? '')
      }
    },

    /** Assign a new literal back into the base workspace. */
    async writeVariable(request = {}) {
      const identifier = String(request.name ?? '').trim()
      if (!/^[A-Za-z]\w{0,62}$/.test(identifier)) throw new Error(`not a variable name: ${identifier}`)
      const text = String(request.text ?? '').replace(/\r?\n/g, ' ').trim()
      if (text === '') throw new Error('empty value')
      if (text.length > 8000) throw new Error('the value is too long to assign from the panel')
      const cfg = await config()
      if (session.status().running !== true) throw new Error('the MATLAB session is not running yet — run a script first')
      const dir = scratchDir(cfg)
      await mkdir(dir, { recursive: true })
      const outPath = join(dir, 'var.json')
      const scriptPath = join(dir, 'dshVarWrite.m')
      await rm(outPath, { force: true })
      const lines = [
        `n = '${quoteM(identifier)}';`,
        `t = '${quoteM(text)}';`,
        'try',
        "  evalin('base', sprintf('%s = %s;', n, t));",
        "  x = evalin('base', n);",
        '  info = struct("name", n, "cls", class(x), "size", size(x), "ok", true);',
        'catch e',
        '  info = struct("name", n, "ok", false, "error", e.message);',
        'end',
        `f = fopen('${quoteM(outPath)}', 'w');`,
        'if f > 0',
        'fwrite(f, jsonencode(info));',
        'fclose(f);',
        'end'
      ]
      await writeFile(scriptPath, `${lines.join('\n')}\n`, 'utf8')
      await session.run(scriptPath, 30_000, cfg.workdir)
      let parsed = {}
      try {
        parsed = JSON.parse(await readFile(outPath, 'utf8'))
      } catch {
        throw new Error(`could not assign ${identifier}`)
      }
      if (parsed.ok !== true) throw new Error(String(parsed.error ?? `could not assign ${identifier}`))
      varsCache = undefined
      return { name: identifier, cls: String(parsed.cls ?? ''), size: Array.isArray(parsed.size) ? parsed.size : [] }
    },

    /** Resolve a preview path to bytes + content type. */
    async artifactPayload(raw) {
      const cfg = await config()
      const abs = insideRoots(cfg, raw)
      const bytes = await readFile(abs)
      const ext = extname(abs).toLowerCase()
      const type = ext === '.png' ? 'image/png'
        : ext === '.svg' ? 'image/svg+xml'
          : ext === '.webp' ? 'image/webp'
            : ext === '.gif' ? 'image/gif'
              : 'image/jpeg'
      return { bytes, type, path: abs }
    }
  }
}
