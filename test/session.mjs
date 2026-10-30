/**
 * Integration test for the persistent-session path: boots one real MATLAB,
 * runs two scripts through it, and checks timing, output, markers and the
 * figure artifacts. Requires a machine with MATLAB and permission to write
 * outside the workspace HOME (MATLAB writes ~/Library/Application Support).
 *
 *   node test/session.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunner, defaultConfig, normalizeConfig } from '../lib/runner.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-matlab-session-'))
const config = normalizeConfig({
  ...defaultConfig(),
  mode: 'session',
  workdir: root,
  scriptDir: join(root, 'matlab'),
  timeoutMs: 300000
})

const runner = createRunner({
  // Batch mode is not exercised here; session mode spawns MATLAB itself.
  spawn: () => {
    throw new Error('batch spawn must not be used in session mode')
  },
  config: async () => config
})

const state = await runner.probe()
assert.equal(state.mode, 'session')
assert.equal(state.session.running, false, 'nothing booted before the first run')

// --- run 1: boot + a trivial script ---------------------------------------
const first = await runner.runToCompletion({ code: 'disp("session ok"); disp(version)', name: 'boot' })
assert.equal(first.status, 'exited', `first run failed: ${first.error}`)
assert.equal(first.exitCode, 0)
assert.equal(first.mode, 'session')
assert.match(first.output, /session ok/)
assert.match(first.output, /26\.1\.0\.3251617 \(R2026a\) Update 2/)
assert.equal(first.timedOut, false)
const bootMs = first.elapsedMs
console.log(`first run (includes boot): ${bootMs}ms`)

const afterFirst = await runner.probe()
assert.equal(afterFirst.session.running, true, 'the session stays alive after a run')
assert.ok(afterFirst.session.pid > 0)

// --- run 2: same session, must be far faster -------------------------------
const second = await runner.runToCompletion({ code: 'disp(numel(1:1000))', name: 'fast' })
assert.equal(second.status, 'exited')
assert.match(second.output, /1000/)
const warmMs = second.elapsedMs
console.log(`second run (warm session): ${warmMs}ms`)
assert.ok(warmMs < Math.max(3000, bootMs / 2), `warm run should be much faster (${warmMs}ms vs ${bootMs}ms)`)

// --- run 3: a throwing script reports the error, session survives ---------
const tFail = Date.now()
const failing = await runner.runToCompletion({ code: 'error("boom from the test")', name: 'boom' })
console.log(`failing run: ${Date.now() - tFail}ms`)
assert.equal(failing.status, 'failed')
assert.match(failing.output, /boom from the test/)
const afterFail = await runner.probe()
assert.equal(afterFail.session.running, true, 'a failing script must not kill the session')

// --- run 4: a figure is exported and picked up as an artifact -------------
const tPlot = Date.now()
const plotting = await runner.runToCompletion({
  code: [
    'f = figure("Visible", "off");',
    'plot(1:10, (1:10).^2);',
    'exportgraphics(f, fullfile(pwd, "session_plot.png"));',
    'close(f);',
    'disp("figure saved")'
  ].join('\n'),
  name: 'figure_demo'
})
console.log(`figure run (first figure initializes the graphics stack): ${Date.now() - tPlot}ms`)
assert.equal(plotting.status, 'exited', `plot run failed: ${plotting.error}`)
assert.match(plotting.output, /figure saved/)
assert.ok(Array.isArray(plotting.artifacts) && plotting.artifacts.length > 0, 'the exported figure is an artifact')
const png = plotting.artifacts.find((artifact) => artifact.name === 'session_plot.png')
assert.ok(png !== undefined, 'session_plot.png is among the artifacts')
const payload = await runner.artifactPayload(png.path)
assert.equal(payload.type, 'image/png')
assert.ok(payload.bytes.length > 1000, 'the PNG has real bytes')

// --- scripts / save / read round trip ------------------------------------
const saved = await runner.save({ code: 'disp("saved script")', name: 'saved_demo' })
assert.match(saved.path, /saved_demo\.m$/)
const listed = await runner.scripts()
assert.ok(listed.some((script) => script.name === 'saved_demo'), 'saved script shows up in the picker')
const readBack = await runner.readScript(saved.path)
assert.match(readBack.code, /saved script/)

// --- stop() aborts a run and leaves the session restartable --------------
const longRun = await runner.start({ code: 'pause(30); disp("never")', name: 'long' })
await new Promise((resolve) => setTimeout(resolve, 1200))
const tStop = Date.now()
const stopped = await runner.stop(longRun.id)
console.log(`stop while pause(30): ${Date.now() - tStop}ms`)
assert.equal(stopped.status, 'failed')
const afterStop = await runner.probe()
assert.equal(afterStop.session.running, false, 'stop kills the session')

runner.dispose()
await new Promise((resolve) => setTimeout(resolve, 300))
await rm(root, { recursive: true, force: true })

console.log('session: ok')
