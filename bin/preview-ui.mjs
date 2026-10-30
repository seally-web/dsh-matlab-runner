#!/usr/bin/env node
/**
 * Renders both panel views to static HTML without a browser session.
 *
 * The panel is plain React.createElement, so a ~60-line reactive stub is enough:
 * hooks are stored per component, state setters re-run the tree, effects are
 * collected and flushed after each pass. The result is real markup plus the real
 * CSS, i.e. what the sidebar would paint given the canned host responses below.
 *
 *   node bin/preview-ui.mjs
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --screenshot=/tmp/panel.png --window-size=980,760 file:///tmp/mrun-panel.html
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const source = readFileSync(`${root}/lib/client.js`, 'utf8')

const css = source.slice(
  source.indexOf('style.textContent = `') + 'style.textContent = `'.length,
  source.indexOf('\n      document.head.appendChild(style)')
)

/* ── a tiny reactive React ───────────────────────────────────────────────── */
const GLOBAL = { hooks: new Map(), dirty: false, effects: [], current: null }
const reset = () => { for (const state of GLOBAL.hooks.values()) state.index = 0; GLOBAL.effects = [] }

const react = {
  Fragment: 'Fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState(initial) {
    const state = GLOBAL.hooks.get(GLOBAL.current)
    if (state === undefined) throw new Error('useState outside a component')
    const index = state.index++
    if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial
    return [state.slots[index], (next) => {
      const value = typeof next === 'function' ? next(state.slots[index]) : next
      if (state.slots[index] !== value) { state.slots[index] = value; GLOBAL.dirty = true }
    }]
  },
  useEffect(fn) { GLOBAL.effects.push(fn) },
  useLayoutEffect(fn) { GLOBAL.effects.push(fn) },
  useRef(initial) {
    const state = GLOBAL.hooks.get(GLOBAL.current)
    const index = state.index++
    if (!(index in state.slots)) state.slots[index] = { current: initial }
    return state.slots[index]
  },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn()
}

const store = new Map()
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
}
const document = {
  getElementById: () => null,
  head: { appendChild: () => {} },
  createElement: () => ({ style: {}, setAttribute() {} }),
  addEventListener() {}, removeEventListener() {}
}

/* ── canned host responses (what the sidebar normally fetches) ───────────── */
const workspace = '/Users/me/Documents/default-workspace'
const responses = {
  roots: { ok: true, value: { workdir: '/ws', roots: [
    { path: '/ws', name: 'default-workspace', kind: 'workspace' },
    { path: '/ws/matlab', name: 'matlab', kind: 'script' },
    { path: '/Users/me/Downloads/MathorCup', name: 'MathorCup', kind: 'extra' } ] } },
  state: { ok: true, value: {
    mode: 'session', matlabPath: '/Applications/MATLAB_R2026a.app/bin/matlab', matlabPresent: true,
    workdir: workspace, scriptDir: `${workspace}/matlab`, timeoutMs: 600000,
    configPath: '/Users/me/.dsh/matlab-runner.json',
    session: { running: true, pid: 89861 },
    detected: { source: 'session', cwd: workspace },
    config: { mode: 'session', warmFigures: false, autoSave: true, autoDetect: true, workdir: workspace,
      scriptDir: `${workspace}/matlab`, timeoutMs: 600000, matlabPath: '/Applications/MATLAB_R2026a.app/bin/matlab',
      autoSave: true } } },
  scripts: { ok: true, value: { scripts: [
    { name: 'demo_plot', file: 'demo_plot.m', path: `${workspace}/matlab/demo_plot.m` },
    { name: 'W07_quiz', file: 'W07_quiz.m', path: `${workspace}/W07_quiz/W07_quiz.m` }] } },
  tree: { ok: true, value: { root: workspace, path: workspace, parent: null, entries: [
    { name: 'bin', path: `${workspace}/bin`, type: 'dir' },
    { name: 'matlab', path: `${workspace}/matlab`, type: 'dir' },
    { name: 'W07_quiz', path: `${workspace}/W07_quiz`, type: 'dir' },
    { name: 'plugins', path: `${workspace}/plugins`, type: 'dir' },
    { name: 'demo_plot.m', path: `${workspace}/matlab/demo_plot.m`, type: 'file', editable: true }] } },
  vars: { ok: true, value: { session: { running: true }, vars: [
    { name: 'd', value: '8', cls: 'double', size: [1, 1], bytes: 8 },
    { name: 'dY', value: '249x8 double', cls: 'double', size: [249, 8], bytes: 15936 },
    { name: 'delta1', value: '-1.8674', cls: 'double', size: [1, 1], bytes: 8 },
    { name: 'explained', value: '59.9353', cls: 'double', size: [1, 8], bytes: 64 },
    { name: 'filename', value: "'CGBYieldCurveAndOthers.xlsx'", cls: 'char', size: [1, 27], bytes: 54 },
    { name: 'Sigma', value: '8x8 double', cls: 'double', size: [8, 8], bytes: 512 }] } }
}
const fetch = async (url) => {
  const route = String(url).replace(/^.*?matlab\/api\//, '').split(/[?&]/)[0]
  return { json: async () => responses[route] ?? responses.state }
}

for (const key of ['showTree', 'showVars']) store.set(`dsh.matlab-runner.${key}`, '1')
store.set('dsh.matlab-runner.varsHeight', '190')
store.set('dsh.matlab-runner.activeBuffer', `${workspace}/W07_quiz/W07_quiz.m`)

let loaded
const window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
runInNewContext(source, { window, document, localStorage, navigator: { language: 'zh-CN' }, fetch,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: (fn) => setTimeout(fn, 0), console },
{ filename: 'client.js' })

const exports = loaded.factory((id) => (id === 'react' ? react : {}))
let body
exports.apply({
  effect: (fn) => { fn(); return () => {} },
  locale: { bind: () => (key) => key, register: () => () => {} },
  inject: () => {}, shortcuts: { register: () => () => {} },
  sidebarRight: { openTab: () => {} }, sidebarRightTabs: { register: () => () => {} },
  slots: { inject: (seat, fn) => fn(), register: (def, component) => {
    if (def.name === 'sidebar.right.pane.tab') body = component
    return () => {}
  } }
})

const dictionary = {
  run: '运行', stop: '停止', save: '保存', newScript: '新建', files: '文件', tree: '文件', variables: '变量',
  settings: '设置', session: '会话', output: '输出', name: '名称', cls: '类型', size: '大小', value: '值',
  refreshVars: '刷新', noVars: '会话里还没有变量。', noSessionVars: '会话未启动，先运行一次脚本。',
  idle: '未运行', running: '运行中…', exited: '已结束', failed: '失败', exit: '退出码', elapsed: '耗时',
  up: '上一级', refresh: '刷新', close: '返回编辑器', empty: '（还没有输出）',
  runMode: '运行', workspace: '工作区', matlabRuntime: 'MATLAB', mode: '运行模式',
  warmFigures: '启动时预初始化图形栈（首次绘图变快）', autoSave: '运行成功后自动保存到文件',
  autoDetect: '自动跟随当前工作区（换文件夹不用改路径）', detectedWorkspace: '检测到的工作区',
  detectedSession: '来自当前会话', detectedRegistry: '来自工作区列表', detectedFallback: '回退到进程目录',
  detectedConfig: '来自配置', useCurrentWorkspace: '跟随当前工作区', pinWorkspace: '固定为当前路径',
  saveConfig: '保存配置', restartSession: '重启会话', matlabPath: 'MATLAB 路径', workdir: '工作目录',
  scriptDir: '脚本保存目录', timeout: '超时（毫秒）', configPath: '配置文件',
  sessionRunning: '会话进行中', sessionIdle: '会话未启动', unsaved: '未保存',
  modeSession: '常驻会话（快，figure 会弹窗）', modeBatch: '批处理（每次冷启动，无窗口）',
  saveInfo: '保存与草稿', helpInfo: '功能一览',
  saveInfoFile: '打开的文件：保存 / 自动保存都直接覆盖原文件，不产生副本。',
  saveInfoDraft: '草稿（＋新建的未命名缓冲）：点保存才落盘，另存到「脚本保存目录」下的 <名字>.m。',
  saveInfoBuffer: '未保存的编辑内容存在浏览器 localStorage（dsh.matlab-runner.buffers），刷新页面、切换文件都不会丢。',
  helpRun: '▶ 运行 / ⌘·Ctrl+Enter：跑当前缓冲区；打开的是真实文件就就地运行，相对路径按脚本所在目录解析。',
  helpStop: '■ 停止：终止当前运行；会话模式会重启会话，下次运行要再等 6-9 秒启动。',
  helpSave: '保存：真实文件直接覆盖；草稿另存到脚本保存目录。',
  helpPicker: '脚本下拉：切换已保存脚本；标着「未保存」的是还没落盘的草稿。',
  helpNew: '＋ 新建：开一个草稿缓冲，原来的内容按名字记住，不会丢。',
  helpTree: '⌸ 文件：文件树，点目录展开、点文件打开，顶部「↑ 上一级 / 刷新」。',
  helpVars: 'Σ 变量：左栏下半部分显示 MATLAB 工作区（名称 / 值 / 类型 / 大小），每次运行后自动刷新。',
  helpSplit: '拖拽：文件树与变量之间、左栏与编辑器之间、编辑器与控制台之间都能拖。',
  helpSession: '会话徽章：绿点=常驻会话活着；灰点=未启动（首次运行自动启动）。'
}
const t = (key) => dictionary[key] ?? key

const ATTRIBUTES = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex' }
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const styleToCss = (style) => Object.entries(style ?? {})
  .map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`).join(';')

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  if (typeof node.type === 'function') {
    const previous = GLOBAL.current
    let state = GLOBAL.hooks.get(node.type)
    if (state === undefined) { state = { slots: [], index: 0 }; GLOBAL.hooks.set(node.type, state) }
    state.index = 0
    GLOBAL.current = node.type
    const output = node.type(node.props)
    GLOBAL.current = previous
    return render(output)
  }
  if (node.type === 'Fragment') return render(node.children)
  const { props } = node
  let attributes = ''
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'children' || key === 'value' || key === 'ref' || key === 'style' || /^on[A-Z]/.test(key)) continue
    const name = ATTRIBUTES[key] ?? (/^data-|^aria-/.test(key) ? key : undefined)
    if (name !== undefined) attributes += ` ${name}="${escape(value)}"`
  }
  if (props.style !== undefined) attributes += ` style="${escape(styleToCss(props.style))}"`
  if (node.type === 'textarea') return `<textarea${attributes}>${escape(props.value ?? '')}</textarea>`
  if (node.type === 'input') {
    const extra = props.type === 'checkbox' ? (props.checked ? ' checked' : '') : ` value="${escape(props.value ?? '')}"`
    return `<input${attributes} type="${props.type ?? 'text'}"${extra}>`
  }
  if (node.type === 'option') return `<option${attributes}>${render(node.children)}</option>`
  return `<${node.type}${attributes}>${render(node.children.flat(Infinity))}</${node.type}>`
}

const page = (title, html) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>html,body{margin:0;height:100%;background:#fff;color:#1f2328;font-family:-apple-system,"PingFang SC",sans-serif}
#host{position:absolute;inset:0;display:flex}</style><style>${css}</style></head><body><div id="host">${html}</div></body></html>`

async function paint(props) {
  GLOBAL.hooks.clear()
  let html = ''
  for (let pass = 0; pass < 12; pass += 1) {
    GLOBAL.dirty = false
    reset()
    html = render({ type: body, props })
    const effects = GLOBAL.effects
    for (const effect of effects) { try { effect() } catch (error) { console.error('effect failed:', error) } }
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (!GLOBAL.dirty && pass > 0) break
  }
  return html
}

writeFileSync('/tmp/mrun-settings.html', page('settings', await paint({ useTabInfo: () => ({}), t, initialView: 'settings' })))
writeFileSync('/tmp/mrun-panel.html', page('panel', await paint({ useTabInfo: () => ({}), t })))
console.log('wrote /tmp/mrun-panel.html /tmp/mrun-settings.html')
