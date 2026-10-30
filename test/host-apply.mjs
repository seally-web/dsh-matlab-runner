/**
 * Host-half integration test WITHOUT the app: calls the real `apply()` with a
 * fake cordis context, then drives the `/matlab/api/*` handler the way the panel
 * does. Catches route typos, envelope mistakes and effect-ordering problems that
 * unit tests on runner.js cannot see.
 *
 *   node test/host-apply.mjs
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'dsh-matlab-apply-'))
// Keep the plugin's config inside the temp root instead of the real DSH home.
process.env.DSH_HOME = root
register('./stub-tools.mjs', import.meta.url)

const { apply, inject } = await import('../lib/index.js')
assert.deepEqual(inject, ['webServer', 'subprocess', 'workspaceRegistry'])

// --- fake cordis context ---------------------------------------------------
const disposers = []
const effects = []
const tools = []
let route
const ctx = {
  effect(fn, label) {
    effects.push(label)
    const result = fn()
    const dispose = typeof result === 'function' ? result : () => {}
    disposers.push(dispose)
    return dispose
  },
  inject(_services, fn) {
    fn({ effect: ctx.effect, tools: { register: (tool) => { tools.push(tool); return () => {} } } })
  },
  webServer: {
    register(definition) {
      route = definition
      return () => {}
    }
  },
  subprocess: {
    spawn() {
      throw new Error('session mode must not touch ctx.subprocess')
    }
  },
  workspaceRegistry: {
    list() { return [] }
  }
}

apply(ctx)
assert.ok(route !== undefined, 'the /matlab/api route is registered')
assert.equal(route.kind, 'prefix')
assert.equal(route.path, '/matlab/api')
assert.equal(tools.length, 1, 'one agent tool is registered')
assert.equal(tools[0].name, 'matlab_run')
assert.deepEqual(effects, [
  'dsh-matlab-runner: matlab_run tool',
  'dsh-matlab-runner: /matlab/api routes',
  'dsh-matlab-runner: persistent MATLAB session lifecycle',
  'dsh-matlab-runner: run registry pruning'
])

// --- fake request/response -------------------------------------------------
const exchange = async (method, url, body) => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const request = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    }
  }
  const captured = { status: 200, headers: {}, body: undefined }
  const response = {
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers ?? {}
    },
    end(body) {
      captured.body = body
    }
  }
  await route.handler(request, response)
  const text = typeof captured.body === 'string' ? captured.body : captured.body?.toString('utf8')
  const payload = /application\/json/.test(captured.headers['content-type'] ?? '') && text !== undefined
    ? JSON.parse(text)
    : undefined
  return { ...captured, payload }
}
const ok = async (method, url, body, label) => {
  const result = await exchange(method, url, body)
  assert.equal(result.status, 200, `${label}: HTTP ${result.status}`)
  assert.equal(result.payload?.ok, true, `${label}: ${JSON.stringify(result.payload?.error ?? result.payload)}`)
  return result.payload.value
}
const fails = async (method, url, body, label) => {
  const result = await exchange(method, url, body)
  assert.equal(result.payload?.ok, false, `${label}: expected a failure envelope`)
  return result.payload.error
}

// --- state / config -------------------------------------------------------
const state = await ok('GET', '/matlab/api/state', undefined, 'state')
assert.equal(state.mode, 'session')
assert.equal(state.matlabPresent, true)
assert.equal(state.session.running, false)
assert.match(state.configPath, /matlab-runner\.json$/)
// Keep every scratch script and figure inside the temp root.
await ok('POST', '/matlab/api/config', { autoDetect: false, workdir: root, scriptDir: join(root, 'matlab') }, 'config seed')
const saved = await ok('POST', '/matlab/api/config', { warmFigures: true, timeoutMs: 120000 }, 'config')
assert.equal(saved.config.warmFigures, true)
assert.equal(saved.config.timeoutMs, 120000)
await ok('POST', '/matlab/api/config', { warmFigures: false, timeoutMs: 600000 }, 'config restore')

// --- workspace auto-detection ---------------------------------------------
// The panel reports its session's folder on every call; the paths follow it.
await ok('POST', '/matlab/api/config', { autoDetect: true }, 'auto seed')
const following = await ok('GET', `/matlab/api/state?cwd=${encodeURIComponent(root)}`, undefined, 'state with cwd')
assert.equal(following.config.workdir, root, 'workdir follows the reported workspace')
assert.equal(following.config.scriptDir, join(root, 'matlab'), 'scriptDir follows the reported workspace')
assert.equal(following.detected.source, 'session')
assert.equal(following.detected.cwd, root)
// A folder that does not exist is ignored, and the panel keeps working.
const bogus = await ok('GET', `/matlab/api/state?cwd=${encodeURIComponent(join(root, 'nope'))}`, undefined, 'state with bogus cwd')
assert.equal(bogus.detected.cwd, root, 'the last good workspace stays')
assert.match(bogus.detected.error, /workspace not found/)
// Manual mode wins over detection.
await ok('POST', '/matlab/api/config', { autoDetect: false }, 'pin seed')
const pinned = await ok('GET', `/matlab/api/state?cwd=${encodeURIComponent('/tmp')}`, undefined, 'state pinned')
assert.equal(pinned.config.workdir, root, 'pinned workdir is not overridden')
assert.equal(pinned.detected.source, 'config')
// Path failures explain which workspace the panel is on.
const explained = await fails('GET', `/matlab/api/tree?path=${encodeURIComponent('/etc')}`, undefined, 'tree escape hint')
assert.match(explained.message, /当前工作区/)
// A stale report stops being trusted (the agent tool must not inherit it).
await ok('POST', '/matlab/api/config', { autoDetect: true }, 'auto for ttl')
await ok('GET', `/matlab/api/state?cwd=${encodeURIComponent(root)}`, undefined, 'refresh session cwd')
process.env.DSH_MATLAB_RUNNER_DETECT_TTL_MS = '30'
await new Promise((resolve) => setTimeout(resolve, 80))
const stale = await ok('GET', '/matlab/api/state', undefined, 'state after ttl')
assert.notEqual(stale.detected.cwd, root, 'a stale workspace report is dropped')
assert.equal(stale.detected.source, 'fallback')
delete process.env.DSH_MATLAB_RUNNER_DETECT_TTL_MS
// Back to auto so the run block below works with an explicit root seed.
await ok('POST', '/matlab/api/config', { autoDetect: false, workdir: root, scriptDir: join(root, 'matlab') }, 'config restore')

const started = await ok('POST', '/matlab/api/run', { code: 'disp(6*7)', name: 'six' }, 'run')
assert.equal(started.mode, 'session')
const pollUntilDone = async (id) => {
  for (let i = 0; i < 600; i += 1) {
    const snapshot = await ok('GET', `/matlab/api/poll?id=${encodeURIComponent(id)}`, undefined, 'poll')
    if (snapshot.status !== 'running' && snapshot.status !== 'stopping') return snapshot
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('run did not finish')
}
const finished = await pollUntilDone(started.id)
assert.equal(finished.status, 'exited', `run failed: ${finished.error}`)
assert.match(finished.output, /42/)
const warm = await ok('POST', '/matlab/api/run', { code: 'disp(numel(1:7))', name: 'warm' }, 'run 2')
const warmDone = await pollUntilDone(warm.id)
assert.match(warmDone.output, /7/)
assert.ok(warmDone.elapsedMs < 5000, `warm run took ${warmDone.elapsedMs}ms`)
await fails('GET', '/matlab/api/poll?id=nope', undefined, 'unknown run')

// --- scripts + artifact routes -------------------------------------------
await ok('POST', '/matlab/api/script', { code: 'disp("saved via route")', name: 'route_demo' }, 'script save')
const listed = await ok('GET', '/matlab/api/scripts', undefined, 'scripts')
assert.ok(listed.scripts.some((script) => script.name === 'route_demo'))
const read = await ok('GET', `/matlab/api/script?path=${encodeURIComponent('route_demo.m')}`, undefined, 'script read')
assert.match(read.code, /saved via route/)
const viaFile = await ok('POST', '/matlab/api/run', { file: 'route_demo.m' }, 'run by file')
assert.equal(viaFile.mode, 'session')
const viaFileDone = await pollUntilDone(viaFile.id)
assert.match(viaFileDone.output, /saved via route/)
const plot = await ok('POST', '/matlab/api/run', {
  code: 'f = figure("Visible", "off"); plot(1:5); exportgraphics(f, fullfile(pwd, "route_plot.png")); close(f);',
  name: 'route_plot'
}, 'plot run')
const plotDone = await pollUntilDone(plot.id)
const artifact = (plotDone.artifacts ?? []).find((entry) => entry.name === 'route_plot.png')
assert.ok(artifact !== undefined, 'artifact listed')
const image = await exchange('GET', `/matlab/api/artifact?path=${encodeURIComponent(artifact.path)}`)
assert.equal(image.status, 200)
assert.match(image.headers['content-type'], /^image\/png/)
assert.ok((image.body?.length ?? 0) > 1000)
const escape = await fails('GET', `/matlab/api/artifact?path=${encodeURIComponent('/etc/hosts')}`, undefined, 'path escape')
assert.match(escape.message, /outside the configured roots/)

// --- .mlx preview route ---------------------------------------------------
await mkdir(join(root, 'matlab'), { recursive: true })
await copyFile(new URL('./fixtures/live_demo.mlx', import.meta.url), join(root, 'matlab', 'live_demo.mlx'))
const mlx = await ok('GET', `/matlab/api/mlx?path=${encodeURIComponent('live_demo.mlx')}`, undefined, 'mlx')
assert.ok(mlx.sections.length > 0, 'mlx sections')
assert.ok(mlx.sections.some((section) => section.type === 'code'), 'mlx code section')
assert.ok(mlx.images.length >= 1, 'mlx images')
assert.match(mlx.images[0].dataUrl, /^data:image\//)
await fails('GET', `/matlab/api/mlx?path=${encodeURIComponent('/etc/hosts')}`, undefined, 'mlx escape')

// --- file tree + variables routes ---------------------------------------
const treeRoot = await ok('GET', '/matlab/api/tree', undefined, 'tree')
assert.equal(treeRoot.parent, null)
assert.ok(treeRoot.entries.some((entry) => entry.type === 'dir' && entry.name === 'matlab'), 'scriptDir shows up in the tree')
const treeSub = await ok('GET', `/matlab/api/tree?path=${encodeURIComponent(treeRoot.path + '/matlab')}`, undefined, 'tree sub')
assert.ok(treeSub.entries.some((entry) => entry.name === 'route_demo.m' && entry.editable === true))
await fails('GET', `/matlab/api/tree?path=${encodeURIComponent('/etc')}`, undefined, 'tree escape')
const defined = await ok('POST', '/matlab/api/run', { code: 'probeVar = 42; textVar = "hi";', name: 'vars_probe' }, 'vars run')
await pollUntilDone(defined.id)
const varsValue = await ok('GET', '/matlab/api/vars?force=1', undefined, 'vars')
assert.ok(Array.isArray(varsValue.vars), 'vars is a list')
const probeEntry = varsValue.vars.find((entry) => entry.name === 'probeVar')
assert.ok(probeEntry !== undefined && probeEntry.cls === 'double', `probeVar listed: ${JSON.stringify(varsValue.vars.map((v) => v.name))}`)

// --- variable editor (double-click a row) ------------------------------
const varRead = await ok('GET', '/matlab/api/var?name=probeVar', undefined, 'var read')
assert.equal(varRead.name, 'probeVar')
assert.equal(varRead.cls, 'double')
assert.equal(varRead.text.trim(), '42')
const varWrote = await ok('POST', '/matlab/api/var', { name: 'probeVar', text: '123' }, 'var write')
assert.equal(varWrote.name, 'probeVar')
const varAgain = await ok('GET', '/matlab/api/var?name=probeVar', undefined, 'var reread')
assert.equal(varAgain.text.trim(), '123')
const charVar = await ok('GET', '/matlab/api/var?name=textVar', undefined, 'var read char')
assert.match(charVar.text, /hi/)
await fails('GET', '/matlab/api/var?name=1bad', undefined, 'var name guard')
await fails('POST', '/matlab/api/var', { name: 'probeVar', text: 'not matlab(' }, 'var write syntax error')

// --- change probe used by the panel's refresh loop ---------------------
const before = await ok('GET', '/matlab/api/stat?path=matlab/route_demo.m', undefined, 'stat before')
assert.equal(before.exists, true)
assert.equal(typeof before.mtimeMs, 'number')
await new Promise((resolve) => setTimeout(resolve, 20))
await writeFile(join(root, 'matlab', 'route_demo.m'), 'x = 5;\n', 'utf8')
const after = await ok('GET', '/matlab/api/stat?path=matlab/route_demo.m', undefined, 'stat after')
assert.ok(after.mtimeMs > before.mtimeMs, 'mtime moves after an outside edit')
const reread = await ok('GET', '/matlab/api/script?path=matlab/route_demo.m', undefined, 'reread changed file')
assert.equal(reread.code.trim(), 'x = 5;')
assert.equal(typeof reread.mtimeMs, 'number', 'readScript reports its mtime')
await fails('GET', '/matlab/api/stat?path=/etc/hosts', undefined, 'stat outside the roots')

// --- extra folders mounted in the tree ---------------------------------
const extraDir = join(root, 'extra-folder')
await mkdir(extraDir, { recursive: true })
await writeFile(join(extraDir, 'notes.txt'), 'hello\n', 'utf8')
const rootsBefore = await ok('GET', '/matlab/api/roots', undefined, 'roots')
assert.ok(rootsBefore.roots.some((entry) => entry.kind === 'workspace'), 'workspace root listed')
const mountedRoots = await ok('POST', '/matlab/api/roots', { path: extraDir }, 'root add')
assert.ok(mountedRoots.roots.some((entry) => entry.path === extraDir && entry.kind === 'extra'), 'extra root listed')
const extraTree = await ok('GET', `/matlab/api/tree?path=${encodeURIComponent(extraDir)}`, undefined, 'tree in mounted folder')
assert.equal(extraTree.parent, null, 'a mount point is a tree root')
assert.ok(extraTree.entries.some((entry) => entry.name === 'notes.txt'), 'mounted folder browses')
await fails('POST', '/matlab/api/roots', { path: '/nope/does/not/exist' }, 'root add missing folder')
const unmountedRoots = await ok('POST', '/matlab/api/roots', { path: extraDir, action: 'remove' }, 'root remove')
assert.ok(!unmountedRoots.roots.some((entry) => entry.path === extraDir), 'extra root removed')

// --- autosave (write back to an exact path) ----------------------------
const target = `${treeRoot.path}/matlab/autosave_demo.m`
const written = await ok('POST', '/matlab/api/file', { path: target, code: 'x = 1;' }, 'write file')
assert.equal(written.path, target)
const reopened = await ok('GET', `/matlab/api/script?path=${encodeURIComponent(target)}`, undefined, 'read back')
assert.equal(reopened.code.trim(), 'x = 1;')
await fails('POST', '/matlab/api/file', { path: '/etc/dsh-autosave.m', code: 'x = 1;' }, 'write escape')
const stateAfter = await ok('GET', '/matlab/api/state', undefined, 'state config')
assert.equal(stateAfter.config.autoSave, true, 'autoSave defaults to on')

// --- a workspace file runs from its own folder --------------------------
// Regression for the W07_quiz case: `readmatrix('data.csv')` must resolve next
// to the script, not in the scratch directory the panel used before.
const quizDir = join(root, 'W07_quiz')
await mkdir(quizDir, { recursive: true })
await writeFile(join(quizDir, 'data.csv'), '1,2\n3,4\n', 'utf8')
const quizScript = join(quizDir, 'quiz.m')
await writeFile(quizScript, 'x = readmatrix("data.csv"); disp(size(x));', 'utf8')
const fromFile = await ok('POST', '/matlab/api/run', {
  code: 'x = readmatrix("data.csv"); disp(size(x));',
  name: 'quiz',
  path: quizScript
}, 'run workspace file')
const fileRun = await pollUntilDone(fromFile.id)
assert.equal(fileRun.exitCode, 0, `workspace file run exits 0: ${fileRun.output}`)
assert.equal(fileRun.scriptPath, quizScript, 'the real file is the script path')
assert.match(fileRun.output, /2\s+2/, 'readmatrix found data.csv next to the script')
assert.equal(fileRun.hint, undefined, 'no relative-path hint on success')

// A missing data file explains the base folder instead of only failing.
const missingScript = join(quizDir, 'missing.m')
await writeFile(missingScript, 'y = readmatrix("nope.csv");', 'utf8')
const missing = await ok('POST', '/matlab/api/run', { code: 'y = readmatrix("nope.csv");', name: 'missing', path: missingScript }, 'run missing data')
const missingRun = await pollUntilDone(missing.id)
assert.notEqual(missingRun.exitCode, 0, 'missing data file fails')
assert.match(missingRun.hint ?? '', /脚本所在目录/, `hint present: ${missingRun.hint}`)

// --- session lifecycle routes -------------------------------------------
const restarted = await ok('POST', '/matlab/api/session/restart', {}, 'session restart')
assert.equal(restarted.running, true)
const stopped = await ok('POST', '/matlab/api/session/stop', {}, 'session stop')
assert.equal(stopped.running, false)

for (const dispose of disposers) dispose()
// The session sends SIGTERM then SIGKILL 3s later; give it room, then leave.
await new Promise((resolve) => setTimeout(resolve, 4000))
await rm(root, { recursive: true, force: true })
console.log('host-apply: ok')
process.exit(0)
