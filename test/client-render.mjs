/**
 * Renders the tab body once with a React stub, which catches the failures a
 * registration-only smoke test cannot see: unknown identifiers, bad hook order,
 * missing dictionary keys, wrong element shapes.
 *   node test/client-render.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let loaded
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'Fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  useLayoutEffect: () => {}
}
const requireStub = (id) => {
  if (id === 'react') return reactStub
  if (id === 'react/jsx-runtime') return { jsx: reactStub.createElement, jsxs: reactStub.createElement, Fragment: 'Fragment' }
  return {}
}

const store = new Map([['dsh.matlab-runner.showTree', '1'], ['dsh.matlab-runner.showVars', '1']])
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: (key) => { store.delete(key) }
}

const document = {
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ style: {}, setAttribute: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {}
}

const responses = {
  state: {
    ok: true,
    value: {
      mode: 'session',
      matlabPath: '/Applications/MATLAB_R2026a.app/bin/matlab',
      matlabPresent: true,
      workdir: '/tmp/ws',
      scriptDir: '/tmp/ws/matlab',
      timeoutMs: 600000,
      configPath: '/tmp/matlab-runner.json',
      session: { running: true, pid: 42 },
      config: { mode: 'session', workdir: '/tmp/ws', scriptDir: '/tmp/ws/matlab', timeoutMs: 600000 }
    }
  },
  scripts: { ok: true, value: { scripts: [{ name: 'demo_plot', file: 'demo_plot.m', path: '/tmp/ws/matlab/demo_plot.m' }] } },
  tree: {
    ok: true,
    value: {
      root: '/tmp/ws',
      path: '/tmp/ws',
      parent: null,
      entries: [
        { name: 'matlab', path: '/tmp/ws/matlab', type: 'dir' },
        { name: 'notes.txt', path: '/tmp/ws/notes.txt', type: 'file', editable: true },
        { name: 'photo.png', path: '/tmp/ws/photo.png', type: 'file', editable: false }
      ]
    }
  },
  vars: { ok: true, value: { vars: [{ name: 'x', cls: 'double', size: [1, 9], bytes: 72 }], session: { running: true } } }
}
const fetch = async (url) => {
  const key = String(url).replace(/^matlab\/api\//, '').split(/[?/]/)[0]
  return { json: async () => responses[key] ?? { ok: false, error: { message: `no stub for ${url}` } } }
}

const window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
runInNewContext(source, {
  window,
  document,
  localStorage,
  navigator: { language: 'zh-CN' },
  fetch,
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => fn(),
  console
}, { filename: 'client.js' })

const exports = loaded.factory(requireStub)
let body
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  locale: { bind: () => (key) => key, register: () => () => {} },
  inject: () => {},
  shortcuts: { register: () => () => {} },
  sidebarRight: { openTab: () => {} },
  sidebarRightTabs: { register: () => () => {} },
  slots: {
    inject: (seat, fn) => fn(),
    register: (definition, component) => {
      if (definition.name === 'sidebar.right.pane.tab') body = component
      return () => {}
    }
  }
}
exports.apply(ctx)
assert.equal(typeof body, 'function')

const collect = (node, predicate, found = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  const children = node.children ?? []
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) collect(child, predicate, found)
  return found
}
const tree = body({ useTabInfo: () => {}, t: (key) => key })
const withAttr = (attribute) => collect(tree, (node) => node?.props?.[attribute] !== undefined && node?.props?.[attribute] !== false)

assert.equal(tree.props.className, 'mrun-root')
assert.equal(withAttr('data-mrun-run').length, 1, 'run button')
assert.equal(withAttr('data-mrun-stop').length, 1, 'stop button')
assert.equal(withAttr('data-mrun-save').length, 1, 'save button')
assert.equal(withAttr('data-mrun-new').length, 1, 'new-script button')
assert.equal(withAttr('data-mrun-tree-toggle').length, 1, 'file-tree toggle')
assert.equal(withAttr('data-mrun-vars-toggle').length, 1, 'variables toggle')
assert.equal(withAttr('data-mrun-split').length, 1, 'draggable splitter')
assert.equal(withAttr('data-mrun-editor').length, 1, 'editor textarea')
assert.equal(withAttr('data-mrun-output').length, 1, 'console')
assert.ok(withAttr('data-mrun-tree').length === 1, 'file tree panel is open (localStorage flag)')
// The tree body is fetched from an effect, and this stub never re-renders, so
// the panel is checked for structure only (rows stay empty on the first pass).
assert.equal(collect(tree, (node) => node?.props?.className === 'mrun-tree-list').length, 1, 'tree list container')
assert.equal(withAttr('data-mrun-vsplit').length, 1, 'vertical splitter between tree and editor')
const sidePanel = withAttr('data-mrun-side')[0]
assert.ok(String(sidePanel.props.style?.width ?? '').endsWith('px'), 'left column carries a draggable width')
// variables live under the tree in the same column, with their own splitter
assert.equal(withAttr('data-mrun-hsplit').length, 1, 'vertical splitter between tree and variables')
assert.equal(withAttr('data-mrun-side-vars').length, 1, 'variables sit inside the left column')
assert.ok(String(withAttr('data-mrun-side-vars')[0].props.style?.height ?? '').endsWith('px'), 'variables panel is resizable')
assert.equal(withAttr('data-mrun-crumb').length, 1, 'breadcrumb shows the current folder')
assert.equal(collect(tree, (node) => node?.props?.className === 'mrun-crumb-seg').length >= 2, true, 'breadcrumb segments')
// folder mounts: a root picker + the add-folder affordance
assert.equal(withAttr('data-mrun-roots').length, 1, 'root picker in the tree header')
assert.equal(withAttr('data-mrun-add-root').length, 1, 'add-folder button')
assert.equal(withAttr('data-mrun-add-root-row').length, 0, 'add-folder input starts collapsed')
// the variable editor is a modal, closed until a row is double-clicked
assert.equal(withAttr('data-mrun-var-modal').length, 0, 'variable modal starts closed')
assert.equal(withAttr('data-mrun-var-save').length, 0, 'no variable save button before opening a row')
const highlight = collect(tree, (node) => node?.props?.className === 'mrun-highlight')[0]
assert.ok(highlight !== undefined, 'syntax highlight layer')
const tokens = collect(highlight, (node) => typeof node?.props?.className === 'string' && node.props.className.startsWith('tk-'))
assert.ok(tokens.length > 0, `highlight tokens painted: ${tokens.length}`)
assert.ok(tokens.some((node) => node.props.className === 'tk-com'), 'comment token painted')
const select = collect(tree, (node) => node?.props?.className === 'mrun-select')[0]
assert.ok(select !== undefined, 'script picker')
assert.ok(Array.isArray(select.children), 'picker options')

// --- workspace auto-detection --------------------------------------------
// The panel hands the host its session's folder on every call, so switching
// folders in DSH needs no config edit.
const { setActiveCwd, withWorkspace } = exports.__test
setActiveCwd('/Users/me/other-project')
assert.equal(withWorkspace('state'), 'state?cwd=%2FUsers%2Fme%2Fother-project')
assert.equal(withWorkspace('tree?path=a'), 'tree?path=a&cwd=%2FUsers%2Fme%2Fother-project')
setActiveCwd('')
assert.equal(withWorkspace('state'), 'state', 'no workspace yet -> plain path')

const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
for (const marker of ['data-mrun-detected', 'data-mrun-follow-workspace', 'data-mrun-pin-workspace']) {
  assert.ok(clientSource.includes(marker), `settings exposes ${marker}`)
}

// --- VS Code-style chrome: grouped toolbar, labelled settings grid -------
const groups = collect(tree, (node) => node?.props?.className === 'mrun-group')
assert.equal(groups.length, 3, `toolbar groups: ${groups.length}`)
assert.equal(collect(tree, (node) => node?.props?.className === 'mrun-console-head').length, 1, 'console header')
assert.equal(collect(tree, (node) => node?.props?.className === 'mrun-statusbar').length, 1, 'console status bar')

const settingsTree = body({ useTabInfo: () => {}, t: (key) => key, initialView: 'settings' })
const inSettings = (predicate) => collect(settingsTree, predicate)
assert.equal(settingsTree.props.className, 'mrun-root')
assert.equal(inSettings((node) => node?.props?.className === 'mrun-settings').length, 1, 'settings pane')
assert.ok(inSettings((node) => node?.props?.className === 'mrun-section').length >= 5, 'settings sections incl. save help and feature list')
assert.equal(inSettings((node) => node?.props?.className === 'mrun-section-head').length, 5, 'section headers (run, workspace, matlab, saving, feature list)')
assert.equal(inSettings((node) => node?.props?.['data-mrun-help'] === 'file').length, 1, 'save semantics documented in the panel')
const labels = inSettings((node) => node?.props?.className === 'mrun-row-label')
assert.equal(labels.length, 5, `labelled rows (inputs/selects): ${labels.length}`)
const checks = inSettings((node) => node?.props?.className === 'mrun-row-check')
assert.ok(checks.length >= 4, `checkbox rows: ${checks.length}`)
const controls = inSettings((node) => node?.props?.['data-mrun-config'] !== undefined)
assert.equal(controls.length, 8, `config controls: ${controls.length}`)
const checkboxes = controls.filter((node) => node.type === 'input' && node.props.type === 'checkbox')
assert.equal(checkboxes.length, 3, `checkbox inputs: ${checkboxes.length}`)
for (const attribute of ['data-mrun-detected', 'data-mrun-follow-workspace', 'data-mrun-pin-workspace', 'data-mrun-restart-session']) {
  assert.equal(inSettings((node) => node?.props?.[attribute] !== undefined && node?.props?.[attribute] !== false).length, 1, attribute)
}
assert.equal(inSettings((node) => node?.props?.className === 'mrun-editor').length, 0, 'editor hidden on the settings page')

console.log('client-render: ok')
