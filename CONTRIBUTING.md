# Contributing

Thanks for poking at the MATLAB runner. It is a **zero-dependency, no-build**
plugin: everything is plain ESM that ships as-is.

## Code map

| File | Responsibility |
| --- | --- |
| `lib/runner.js` | Config (`~/.dsh/matlab-runner.json`), the persistent MATLAB session, `batch` fallback, run registry, file tree / variables / scripts / artifacts / variable read+write, process-group cleanup. |
| `lib/index.js` | The cordis plugin: `inject`, `apply`, `/matlab/api/*` routes, the `matlab_run` agent tool, workspace detection. |
| `lib/client.js` | Browser half: sidebar tab (toolbar, tree, editor, console, variables, settings, variable modal), CSS + zh/en dictionaries. Packed as `window.__ModuleLoader__.load({...})`, so no bundler. |
| `lib/livemd.js` | `.mlx` parser (ZIP + document XML + base64 images), node builtins only. |

Rules of the house:

- **No runtime dependencies.** The package is installed as a link into a profile,
  so only `node:` builtins and host-provided modules (`@deepseek-ai/dsh-tools`) are
  importable.
- **No build step.** `lib/client.js` is hand-written `React.createElement`; do not
  add JSX or a bundler.
- Keep host/browser separation: anything that touches processes or the file
  system belongs in `lib/runner.js` / `lib/index.js`.

## Dev loop

```sh
node test/host-unit.mjs           # pure functions
npm test                          # the five fast suites

node bin/install-local.sh         # copy payload into the desktop profile
                                  # (also re-composes the Loader entry)
# then reload the page with Cmd/Ctrl+R
```

Editing only the host half? `bin/reload-host.sh` re-composes the plugin without
restarting the app. Editing `lib/client.js` always needs a page reload.

## Tests

| Suite | Needs MATLAB | Covers |
| --- | --- | --- |
| `test/host-unit.mjs` | no | config coercion, argv building, tree/variable helpers |
| `test/client-smoke.mjs` | no | client registration order with a fake ctx |
| `test/client-render.mjs` | no | rendered structure (toolbar groups, sections, panel toggles) |
| `test/client-tokenize.mjs` | no | MATLAB tokenizer |
| `test/livemd.mjs` | no | `.mlx` parsing on a real fixture |
| `test/host-apply.mjs` | **yes** | every route against a real session, incl. variables and folder mounts |
| `test/session.mjs` | **yes** | session boot/reuse/kill semantics |

CI runs only the MATLAB-free suites.

## MATLAB facts worth remembering

- Script names must **start with a letter**: `run('_vars.m')` fails with
  "文本字符无效".
- Don't name a helper after a builtin (`plot.m` shadows `plot`).
- `run` switches the current folder to the script's folder; the runner appends
  `cd('<workdir>')` afterwards.
- The first `figure` costs ≈13 s (Java/graphics initialisation); later ones ≈2 s.
  `warmFigures: true` moves that cost to session boot.
- `matlab.app/bin/matlab` daemonizes a child in another process group, hence the
  `detached: true` spawn and the `kill(-pid)` path.

## Pull requests

1. `npm test` is green (and `npm run test:matlab` if you touched the host half).
2. If you changed the panel, attach a screenshot from `npm run preview` or the app.
3. Add a `CHANGELOG.md` line under `## Unreleased`.
4. One topic per PR.
