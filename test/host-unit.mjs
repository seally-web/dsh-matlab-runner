/**
 * Fast smoke tests for the host half: path/name hygiene, the batch argv, the
 * session command line, console cleanup, path containment, the config dialect.
 * Run with `node test/host-unit.mjs`.
 */
import assert from 'node:assert/strict'
import {
  batchArgv,
  cleanConsoleText,
  defaultConfig,
  insideRoots,
  normalizeConfig,
  scriptFileName,
  sessionCommandLine,
  withDetectedWorkspace
} from '../lib/runner.js'

// --- scriptFileName --------------------------------------------------------
assert.equal(scriptFileName('scratch'), 'scratch')
assert.equal(scriptFileName('  demo.m  '), 'demo')
assert.equal(scriptFileName('my script.m'), 'my_script')
assert.doesNotMatch(scriptFileName('../../etc/passwd'), /[\\/]/)
assert.match(scriptFileName(''), /^run_\d{14}$/)
assert.doesNotMatch(scriptFileName('a/b/c'), /\//)

// --- normalizeConfig -------------------------------------------------------
const defaults = defaultConfig()
assert.equal(normalizeConfig({}).matlabPath, defaults.matlabPath)
assert.equal(normalizeConfig({ matlabPath: '   ' }).matlabPath, defaults.matlabPath)
assert.equal(normalizeConfig({ matlabPath: ' /opt/matlab ' }).matlabPath, '/opt/matlab')
assert.deepEqual(normalizeConfig({ extraArgs: ['-nodisplay', 42] }).extraArgs, ['-nodisplay'])
assert.equal(normalizeConfig({ timeoutMs: 10 ** 9 }).timeoutMs, 3_600_000)
assert.equal(normalizeConfig({ timeoutMs: -5 }).timeoutMs, defaults.timeoutMs)
assert.deepEqual(normalizeConfig({ env: { FOO: 'bar' } }).env, { FOO: 'bar' })
// A persistent session is the default; anything else is batch.
assert.equal(normalizeConfig({}).mode, 'session')
assert.equal(normalizeConfig({ mode: 'batch' }).mode, 'batch')
assert.equal(normalizeConfig({ mode: 'weird' }).mode, 'session')
assert.deepEqual(normalizeConfig({ sessionArgs: ['-nodesktop', 7] }).sessionArgs, ['-nodesktop'])

// --- batchArgv -------------------------------------------------------------
const argv = batchArgv(normalizeConfig({ extraArgs: ['-nodisplay', '-nosplash'] }), "/tmp/dir with space/run it's.m")
assert.equal(argv[0], defaults.matlabPath)
assert.deepEqual(argv.slice(1, 3), ['-nodisplay', '-nosplash'])
assert.equal(argv[3], '-batch')
const body = argv[4]
assert.ok(body.startsWith('try, run('))
assert.ok(body.includes("run('/tmp/dir with space/run it''s.m')"), 'single quotes are doubled for MATLAB')
assert.ok(body.includes("catch e, disp(getReport(e, 'extended', 'hyperlinks', 'off'));"))
assert.ok(body.trimEnd().endsWith('exit(1); end'))

// --- sessionCommandLine ----------------------------------------------------
const line = sessionCommandLine("/tmp/it's here/x.m", 'Mabc')
assert.ok(line.startsWith('try, run('))
assert.ok(line.includes("run('/tmp/it''s here/x.m')"))
assert.ok(line.includes('fprintf('), 'the OK marker is printed from inside the try')
assert.ok(line.includes("Mabc:OK"))
assert.ok(line.includes("Mabc:ERR"))
assert.ok(line.trimEnd().endsWith('end'), 'the ERR marker only prints from the catch')
const lineWithCwd = sessionCommandLine("/tmp/a'b/x.m", 'Mabc', "/tmp/w'd")
assert.ok(lineWithCwd.endsWith("cd('/tmp/w''d')"), 'the session returns to the workdir afterwards')
assert.ok(lineWithCwd.indexOf('end;') < lineWithCwd.indexOf("cd("), 'the cd follows the whole try/catch')

// --- cleanConsoleText ------------------------------------------------------
assert.equal(cleanConsoleText(''), '')
assert.equal(cleanConsoleText('>> 4\n\n'), '4')
assert.equal(cleanConsoleText('>> \n>> a\nb\n'), 'a\nb')
assert.equal(cleanConsoleText('hello\r\nworld'), 'hello\nworld')
assert.equal(cleanConsoleText('   spaced   \n'), 'spaced')

// --- insideRoots -----------------------------------------------------------
const cfg = normalizeConfig({ workdir: '/w', scriptDir: '/w/matlab' })
assert.equal(insideRoots(cfg, '/w/matlab/a.m'), '/w/matlab/a.m')
assert.equal(insideRoots(cfg, 'matlab/a.m'), '/w/matlab/a.m')
assert.equal(insideRoots(cfg, '/w/b.png'), '/w/b.png')
assert.throws(() => insideRoots(cfg, '/etc/passwd'), /outside the configured roots/)
assert.throws(() => insideRoots(cfg, '   '), /missing path/)

// --- workspace auto-detection ---------------------------------------------
assert.equal(defaultConfig().autoDetect, true, 'auto-detection is on by default')
assert.equal(normalizeConfig({ autoDetect: false }).autoDetect, false)
assert.equal(normalizeConfig({}).autoDetect, true)
assert.equal(normalizeConfig({ autoDetect: 'yes' }).autoDetect, true, 'only an explicit false opts out')

const followed = withDetectedWorkspace(
  normalizeConfig({ autoDetect: true, workdir: '/old', scriptDir: '/old/matlab' }),
  { cwd: '/new', source: 'session' }
)
assert.equal(followed.workdir, '/new')
assert.equal(followed.scriptDir, '/new/matlab')
assert.deepEqual(followed.detected, { source: 'session', cwd: '/new', error: undefined })

const pinned = withDetectedWorkspace(
  normalizeConfig({ autoDetect: false, workdir: '/old', scriptDir: '/old/matlab' }),
  { cwd: '/new', source: 'session' }
)
assert.equal(pinned.workdir, '/old', 'manual mode keeps the configured paths')
assert.deepEqual(pinned.detected, { source: 'config', cwd: '/old' })

const noDetection = withDetectedWorkspace(normalizeConfig({ workdir: '/old' }), undefined)
assert.equal(noDetection.workdir, '/old')

console.log('host-unit: ok')
