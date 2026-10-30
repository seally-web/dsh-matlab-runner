/**
 * Client bundle smoke test without a browser: supplies the module-loader shell,
 * a React stub, and a fake client context, then checks the plugin registers the
 * tab type, body, title, dictionaries, and its shortcut.
 *   node test/client-smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let loaded
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
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
  return {} // primitives etc.
}

const window = {
  __ModuleLoader__: {
    load: (spec) => { loaded = spec }
  }
}

runInNewContext(source, {
  window,
  document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
  localStorage: new Map(),
  navigator: { language: 'zh-CN' },
  fetch: async () => ({ json: async () => ({ ok: true, value: {} }) }),
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => fn(),
  console
}, { filename: 'client.js' })

assert.equal(loaded.id, 'dsh-matlab-runner')
assert.equal(typeof loaded.factory, 'function')
const exports = loaded.factory(requireStub)
assert.equal(typeof exports.apply, 'function')
assert.ok(Array.isArray(exports.inject))
for (const service of ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']) {
  assert.ok(exports.inject.includes(service), `inject lists ${service}`)
}

// Fake client context: every service records what gets registered.
const calls = { effect: [], locale: [], tabs: [], slots: [], shortcuts: [] }
const disposer = () => {}
const ctx = {
  effect: (fn, label) => { calls.effect.push(label); return disposer(fn()) },
  locale: {
    bind: () => (key) => key,
    register: (ns, dictionaries) => { calls.locale.push({ ns, dictionaries }); return disposer() }
  },
  inject: (services, fn) => { if (services.includes('shortcuts')) fn(ctx) },
  shortcuts: { register: (definition) => { calls.shortcuts.push(definition); return disposer() } },
  sidebarRight: { openTab: () => {} },
  sidebarRightTabs: { register: (definition) => { calls.tabs.push(definition); return disposer() } },
  slots: {
    inject: (seat, fn) => fn(),
    register: (definition, body) => { calls.slots.push({ definition, body }); return disposer() }
  }
}

exports.apply(ctx)

assert.equal(calls.tabs.length, 1)
assert.equal(calls.tabs[0].kind, 'matlab-runner')
assert.equal(calls.tabs[0].priority, 'extension')
assert.equal(calls.tabs[0].guide[0].id, 'matlab')
assert.equal(typeof calls.tabs[0].title(), 'string')

assert.equal(calls.slots.length, 2)
const body = calls.slots.find((entry) => entry.definition.name === 'sidebar.right.pane.tab')
const title = calls.slots.find((entry) => entry.definition.name === 'sidebar.right.pane.tab.title')
assert.ok(body, 'body registered on sidebar.right.pane.tab')
assert.ok(title, 'title registered on sidebar.right.pane.tab.title')
assert.equal(body.definition.key, calls.tabs[0].id)
assert.equal(typeof body.body, 'function')
assert.equal(body.definition.locale, 'matlabRunner')

assert.equal(calls.locale.length, 1)
assert.deepEqual(Object.keys(calls.locale[0].dictionaries).sort(), ['en', 'zh'])
assert.ok(calls.locale[0].dictionaries.zh['run'] !== undefined)

assert.equal(calls.shortcuts.length, 1)
const shortcut = calls.shortcuts[0]
assert.equal(shortcut.id, 'matlab.runner.open')
for (const platform of ['desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows']) {
  assert.ok(shortcut.defaults[platform], `shortcut default for ${platform}`)
}
assert.equal(shortcut.resolve().status, 'handled')

console.log('client-smoke: ok')
console.log('effect labels:', calls.effect.join(' | '))
console.log('file:', fileURLToPath(new URL('../lib/client.js', import.meta.url)))
