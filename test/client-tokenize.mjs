/**
 * Pins the MATLAB highlighter's token split with the cases that used to be
 * ambiguous: transpose vs. string quotes, doubled quotes, inline comments.
 *   node test/client-tokenize.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
let loaded
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'Fragment'
}
runInNewContext(source, {
  window: { __ModuleLoader__: { load: (spec) => { loaded = spec } } },
  document: { getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({}) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { language: 'en' },
  fetch: async () => ({ json: async () => ({ ok: true, value: {} }) }),
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => fn(),
  console
}, { filename: 'client.js' })

const { tokenizeLine, mlxSection } = loaded.factory(() => reactStub).__test
// Array.from copies into this realm, so strict deepEqual compares plain arrays.
const flat = (line) => Array.from(tokenizeLine(line), (token) => `${token.cls ?? 'plain'}:${token.text}`)

// A quote right after a value is transpose, so the whole rest stays plain text.
assert.deepEqual(flat("y = x';"), ["plain:y = x';"])
assert.deepEqual(flat("s = 'abc';"), ['plain:s = ', 'str:\'abc\'', 'plain:;'])
assert.deepEqual(flat("s = 'it''s';"), ['plain:s = ', "str:'it''s'", 'plain:;'])
assert.deepEqual(flat('% whole line'), ['com:% whole line'])
assert.deepEqual(flat('x = 1; % trailing'), ['plain:x = ', 'num:1', 'plain:; ', 'com:% trailing'])
assert.deepEqual(flat('for i = 1:3'), ['kw:for', 'plain: i = ', 'num:1', 'plain::', 'num:3'])
assert.deepEqual(flat('a = "hi ""there"""'), ['plain:a = ', 'str:"hi ""there"""'])
assert.deepEqual(flat('f(2.5e3)'), ['plain:f(', 'num:2.5e3', 'plain:)'])
assert.deepEqual(flat(''), [])
// Live-script sections: headings, inline images, plain output, code colouring.
const images = new Map([['output-1.png', { name: 'output-1.png', dataUrl: 'data:image/png;base64,AAAA' }]])
const first = (node) => (Array.isArray(node.children[0]) ? node.children[0][0] : node.children[0])
const heading = mlxSection({ type: 'text', text: '# One\nbody' }, 0, images, (key) => key)
assert.equal(first(heading).props.className, 'mrun-mlx-heading mrun-mlx-h1')
const figure = mlxSection({ type: 'output', image: 'output-1.png' }, 1, images, (key) => key)
assert.equal(first(figure).props.className, 'mrun-mlx-img')
assert.equal(first(figure).props.src, 'data:image/png;base64,AAAA')
const figureText = mlxSection({ type: 'output', text: '     1     4' }, 2, images, (key) => key)
assert.equal(first(figureText).children[0], '     1     4')
const code = mlxSection({ type: 'code', text: 'x = 1' }, 3, images, (key) => key)
assert.equal(code.props.className, 'mrun-mlx-code')
assert.ok(code.children[0].some((node) => node.props.className === 'tk-num'), 'code section is colourised')
console.log('client-tokenize: ok')
