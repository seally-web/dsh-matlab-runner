/**
 * Integration smoke test for the host half without DSH: a child_process-backed
 * shim that implements the slice of `ctx.subprocess` the runner uses
 * ({ argv, cwd, env, stdio, graceMs, signal } -> { done, collected, terminate }).
 *
 * Runs one real MATLAB snippet end to end. Slow on purpose (~15-20s cold start):
 *   node test/host-run.mjs
 */
import { spawn as spawnChild } from 'node:child_process'
import { createRunner, defaultConfig, normalizeConfig } from '../lib/runner.js'

/** Minimal `ctx.subprocess.spawn` stand-in over node:child_process. */
function spawnShim(spec) {
  const child = spawnChild(spec.argv[0], spec.argv.slice(1), {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const streams = {
    stdout: { chunks: [], text: '' },
    stderr: { chunks: [], text: '' }
  }
  const MAX = spec.stdio?.stdout?.maxBytes ?? 4 * 1024 * 1024
  const collect = (which) => (chunk) => {
    const stream = streams[which]
    stream.chunks.push(chunk)
    const all = Buffer.concat(stream.chunks)
    stream.text = all.subarray(0, MAX).toString('utf8')
  }
  child.stdout.on('data', collect('stdout'))
  child.stderr.on('data', collect('stderr'))
  const done = new Promise((resolve) => {
    child.on('error', (error) => resolve({ exitCode: null, signal: String(error.message) }))
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  return {
    done,
    collected: {
      stdout: { readFrom: () => ({ text: streams.stdout.text }) },
      stderr: { readFrom: () => ({ text: streams.stderr.text }) }
    },
    terminate: () => child.kill('SIGTERM'),
    waitForExit: () => done
  }
}

const config = normalizeConfig({ ...defaultConfig(), timeoutMs: 120_000 })
const runner = createRunner({ spawn: spawnShim, config: async () => config })

const probe = await runner.probe()
console.log('probe:', JSON.stringify({ matlabPath: probe.matlabPath, present: probe.matlabPresent, workdir: probe.workdir }))

const result = await runner.runToCompletion({
  code: ['disp(6*7)', 'fprintf("hello from %s\\n", version)'].join('\n'),
  name: 'smoke'
})

console.log('status:', result.status, 'exit:', result.exitCode, 'elapsed:', result.elapsedMs, 'ms')
console.log('script:', result.scriptPath)
console.log('--- stdout ---')
console.log(result.output.trim())
if (result.error.trim() !== '') {
  console.log('--- stderr ---')
  console.log(result.error.trim())
}
if (result.status !== 'exited' || result.exitCode !== 0 || !result.output.includes('42')) {
  console.error('host-run: FAILED')
  process.exit(1)
}
console.log('host-run: ok')
