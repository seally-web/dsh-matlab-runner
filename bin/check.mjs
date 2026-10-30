#!/usr/bin/env node
/**
 * Live check for dsh-matlab-runner against the running DSH host.
 *
 * Hits the same loopback routes the sidebar tab uses, so a pass here means the
 * host half is loaded, MATLAB is reachable, the persistent session works, and
 * the panel's calls will work. The browser half (the tab itself) is a client
 * bundle; only the page can show that it rendered.
 *
 *   node bin/check.mjs                        # http://127.0.0.1:54501
 *   DSH_GUI_URL=http://127.0.0.1:PORT node bin/check.mjs
 */
const base = (process.env.DSH_GUI_URL ?? 'http://127.0.0.1:54501').replace(/\/$/, '')

const call = async (path, body) => {
  const response = await fetch(`${base}/matlab/api/${path}`, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json()
  if (!payload.ok) throw new Error(`${path}: ${payload.error?.code ?? 'failed'} ${payload.error?.message ?? ''}`)
  return payload.value
}

const runOnce = async (code, name, timeoutMs) => {
  const started = await call('run', { code, name })
  let run = started
  const deadline = Date.now() + timeoutMs
  process.stdout.write(`running ${name}`)
  while (run.status === 'running' || run.status === 'stopping') {
    if (Date.now() > deadline) throw new Error(`timed out waiting for MATLAB (${name})`)
    await new Promise((resolve) => setTimeout(resolve, 200))
    process.stdout.write('.')
    run = await call(`poll?id=${encodeURIComponent(started.id)}`)
  }
  process.stdout.write('\n')
  return run
}

const state = await call('state')
console.log(`config      ${state.configPath}`)
console.log(`mode        ${state.mode}  (warmFigures: ${state.config?.warmFigures === true ? 'on' : 'off'})`)
console.log(`matlab flag ${state.matlabPresent ? 'present' : 'MISSING'}  ${state.matlabPath}`)
console.log(`workdir     ${state.workdirPresent ? 'present' : 'MISSING'}  ${state.workdir}`)
console.log(`scriptDir   ${state.scriptDir}`)
console.log(`session     ${state.session?.running ? `running (pid ${state.session.pid})` : 'not started'}`)
if (!state.matlabPresent) {
  console.error('fix matlabPath in the config above, then run again')
  process.exit(1)
}

// --- first run boots the session ------------------------------------------
const first = await runOnce('disp(version)\ndisp(6*7)', 'check', state.timeoutMs)
console.log(`first run   ${first.status} (exit ${first.exitCode ?? '-'}, ${first.elapsedMs}ms)`)
console.log('--- MATLAB ---')
console.log(first.output.trimEnd())
if (first.status !== 'exited') {
  console.error('\nthe first run failed; see the console text above')
  process.exit(1)
}

const live = await call('state')
if (live.session?.running !== true) {
  console.error('\nthe session did not stay alive after the run')
  process.exit(1)
}
console.log(`session     still running after the run (pid ${live.session.pid})`)

// --- second run must reuse that session -----------------------------------
const second = await runOnce('disp(numel(1:500))', 'warm', state.timeoutMs)
console.log(`second run  ${second.status} (${second.elapsedMs}ms) — reuse of the warm session`)
if (!/500/.test(second.output)) {
  console.error('\nthe warm run printed unexpected output')
  process.exit(1)
}
if (second.elapsedMs > 5000) {
  console.error(`\nthe warm run took ${second.elapsedMs}ms — the session is probably not being reused`)
  process.exit(1)
}

// --- scripts picker --------------------------------------------------------
const { scripts } = await call('scripts')
console.log(`scripts     ${scripts.length} .m file(s) in ${state.scriptDir}`)

// --- a figure export becomes an artifact ----------------------------------
const plot = await runOnce([
  'f = figure("Visible", "off");',
  'plot(1:10, (1:10).^2);',
  'exportgraphics(f, fullfile(pwd, "check_plot.png"));',
  'close(f);',
  'disp("figure saved")'
].join('\n'), 'check_plot', state.timeoutMs)
const artifact = (plot.artifacts ?? []).find((entry) => entry.name === 'check_plot.png')
if (artifact === undefined) {
  console.error('\nthe exported figure did not show up among the run artifacts')
  process.exit(1)
}
const bytes = await fetch(`${base}/matlab/api/artifact?path=${encodeURIComponent(artifact.path)}`)
const image = Buffer.from(await bytes.arrayBuffer())
console.log(`artifact    ${artifact.name} ${image.length} bytes via ${bytes.headers.get('content-type')}`)
if (image.length < 1000 || !/^image\//.test(bytes.headers.get('content-type') ?? '')) {
  console.error('\nthe artifact route did not return an image')
  process.exit(1)
}

console.log('\ncheck: ok — host half, persistent session and artifact route all work')
