/**
 * dsh-matlab-runner — browser half.
 *
 * Loaded by the client module loader as a pre-bundled ESM factory (no build
 * step). Registers one page-type tab in the right sidebar, the one a VS Code
 * user expects: an editor with a line-number gutter, Run (Cmd/Ctrl+Enter),
 * Stop, Save, a script picker for existing .m files, a console with live
 * output, inline previews of the figures a run produced, and a settings pane
 * for the preset paths and the session/batch mode.
 * @module dsh-matlab-runner/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-matlab-runner',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const react = require('react')
    require('@deepseek-ai/dsh-client-ui-primitives')
    const h = react.createElement

    /** This package's copy namespace. */
    const NS = 'matlabRunner'
    /** The tab kind this package owns. */
    const KIND = 'matlab-runner'
    /** Implementation identity, and the key body/title register under. */
    const ID = 'dsh-matlab-runner'
    /** Editor persistence keys. */
    const CODE_KEY = 'dsh.matlab-runner.code'
    const NAME_KEY = 'dsh.matlab-runner.name'
    /** Every open buffer (file path or `draft:<id>` → code), so switching never loses work. */
    const BUFFERS_KEY = 'dsh.matlab-runner.buffers'
    /** Which buffer the editor is showing. */
    const ACTIVE_KEY = 'dsh.matlab-runner.activeBuffer'
    /** Height of the console pane in px (0 = the default split). */
    const CONSOLE_KEY = 'dsh.matlab-runner.consoleHeight'
    const TREE_WIDTH_KEY = 'dsh.matlab-runner.treeWidth'

    /** Buffer map: { [key]: { code, name, at } }. */
    /** Persisted boolean panel flags (tree / variables). */
    function readFlag(key, fallback) {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      return raw === '1'
    }

    function writeFlag(key, value) {
      try {
        localStorage.setItem(key, value ? '1' : '0')
      } catch {
        /* storage disabled: the toggle still works for this render */
      }
    }

    function readBuffers() {
      try {
        const parsed = JSON.parse(localStorage.getItem(BUFFERS_KEY) ?? '{}')
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    const SAMPLE = [
      '% Press Cmd/Ctrl+Enter to run this script with MATLAB.',
      'disp("MATLAB " + version)',
      'x = 0:0.1:3;',
      'y = x.^2;',
      'f = figure("Visible", "on");',
      'plot(x, y);',
      'title("y = x^2");',
      'exportgraphics(f, fullfile(pwd, "dsh_plot.png"));',
      'disp("saved dsh_plot.png")'
    ].join('\n')

    const zh = {
      'type.label': 'MATLAB',
      'guide.title': 'MATLAB 运行器',
      'guide.description': '在侧边栏编辑并运行 .m 代码',
      run: '运行',
      running: '运行中…',
      stop: '停止',
      save: '保存',
      settings: '设置',
      close: '返回编辑器',
      label: 'MATLAB 运行器',
      idle: '就绪',
      exited: '已结束',
      failed: '运行失败',
      stopping: '正在停止…',
      empty: '还没有输出。按 ⌘/Ctrl+Enter 运行；会话模式下 figure 会弹到桌面上。',
      exit: '退出码',
      elapsed: '耗时',
      output: '输出',
      timedOut: '已超时',
      missing: '未找到 MATLAB，检查设置里的路径',
      workdir: '工作目录',
      matlabPath: 'MATLAB 路径',
      scriptDir: '脚本保存目录',
      timeout: '超时（毫秒）',
      mode: '运行模式',
      warmFigures: '启动时预初始化图形栈（首次绘图变快）',
      autoSave: '运行成功后自动保存到文件',
      autoDetect: '自动跟随当前工作区（换文件夹不用改路径）',
      detectedWorkspace: '检测到的工作区',
      detectedSession: '来自当前会话',
      detectedRegistry: '来自已注册工作区',
      detectedFallback: '来自宿主进程目录（未检测到会话）',
      detectedConfig: '手动固定',
      useCurrentWorkspace: '跟随当前工作区',
      pinWorkspace: '固定为当前路径',
      workspacePinned: '已固定为手动路径，换文件夹时需要手动改',
      workspaceAuto: '已启用自动检测',
      runMode: '运行',
      workspace: '工作区',
      matlabRuntime: 'MATLAB',
      output: '输出',
      modeSession: '常驻会话（快，figure 会弹窗）',
      modeBatch: '批处理（每次冷启动，无窗口）',
      configPath: '配置文件',
      saveConfig: '保存配置',
      configSaved: '配置已保存',
      saved: '已保存',
      autoSaved: '已自动保存',
      mlxReadOnly: '实时脚本 · 只读预览',
      saveHint: '文件名（不含 .m）',
      runError: '运行失败：{message}',
      shortcut: '打开 MATLAB 运行器',
      files: '脚本',
      newScript: '新建',
      session: '会话',
      sessionRunning: '会话运行中',
      sessionIdle: '会话未启动',
      restartSession: '重启会话',
      stopSession: '关闭会话',
      sessionRestarted: 'MATLAB 会话已重启',
      artifacts: '图',
      openArtifact: '在新标签页打开图片',
      open: '打开',
      tree: '文件',
      treeTitle: '浏览工作区文件',
      up: '上一级',
      refresh: '刷新',
      unsaved: '未保存',
      draft: '草稿',
      variables: '变量',
      noVars: '会话里还没有变量。运行一段脚本后再看。',
      noSessionVars: '会话未启动，先运行一次脚本。',
      value: '值',
      saveInfo: '保存与草稿',
      saveInfoFile: '打开的文件：保存 / 自动保存都直接覆盖原文件，不产生副本。',
      saveInfoDraft: '草稿（＋新建的未命名缓冲）：点保存才落盘，另存到「脚本保存目录」下的 <名字>.m。',
      saveInfoBuffer: '未保存的编辑内容存在浏览器 localStorage（dsh.matlab-runner.buffers），刷新页面、切换文件都不会丢。',
      helpInfo: '功能一览',
      helpRun: '▶ 运行 / ⌘·Ctrl+Enter：跑当前缓冲区；打开的是真实文件就就地运行，相对路径按脚本所在目录解析。',
      helpStop: '■ 停止：终止当前运行；会话模式会重启会话，下次运行要再等 6-9 秒启动。',
      helpSave: '保存：真实文件直接覆盖；草稿另存到脚本保存目录。',
      helpPicker: '脚本下拉：切换已保存脚本；标着「未保存」的是还没落盘的草稿。',
      helpNew: '＋ 新建：开一个草稿缓冲，原来的内容按名字记住，不会丢。',
      helpTree: '⌸ 文件：文件树，点目录展开、点文件打开，顶部「↑ 上一级 / 刷新」。',
      helpVars: 'Σ 变量：左栏下半部分显示 MATLAB 工作区（名称 / 值 / 类型 / 大小），每次运行后自动刷新。',
      helpSplit: '拖拽：文件树与变量之间、左栏与编辑器之间、编辑器与控制台之间都能拖。',
      helpSession: '会话徽章：绿点=常驻会话活着；灰点=未启动（首次运行自动启动）。',
      savedOverwrite: '已覆盖: {path}',
      roots: '文件夹',
      addRoot: '＋ 文件夹…',
      addRootHint: '绝对路径，例如 ~/Documents/project',
      addRootOk: '挂载',
      cancel: '取消',
      removeRoot: '移除',
      rootAdded: '已挂载: {path}',
      rootRemoved: '已移除: {path}',
      varEditor: '变量',
      varHint: '保存会用 evalin 把这一行赋值回 MATLAB 工作区，例如 [1 2; 3 4]、\'text\'、magic(3)',
      varSave: '写回工作区',
      varCancel: '关闭',
      varSaved: '已写回 {name}',
      varDblHint: '双击变量可查看 / 编辑值',
      savedAs: '已另存为: {path}',
      refreshVars: '刷新变量',
      binary: '不是文本文件，无法在编辑器中打开',
      name: '名称',
      cls: '类型',
      size: '大小',
      bytes: '字节',
      unsavedChanges: '未保存的改动已保留在草稿里'
    }

    const en = {
      'type.label': 'MATLAB',
      'guide.title': 'MATLAB runner',
      'guide.description': 'Edit and run .m code in the sidebar',
      run: 'Run',
      running: 'Running…',
      stop: 'Stop',
      save: 'Save',
      settings: 'Settings',
      close: 'Back to editor',
      label: 'MATLAB runner',
      idle: 'Idle',
      exited: 'Finished',
      failed: 'Failed',
      stopping: 'Stopping…',
      empty: 'No output yet. Press Cmd/Ctrl+Enter to run; in session mode figures open on the desktop.',
      exit: 'exit',
      elapsed: 'elapsed',
      timedOut: 'timed out',
      missing: 'MATLAB binary not found — check the path in Settings',
      workdir: 'Workdir',
      matlabPath: 'MATLAB path',
      scriptDir: 'Script directory',
      timeout: 'Timeout (ms)',
      mode: 'Run mode',
      warmFigures: 'Warm up the graphics stack at boot (faster first figure)',
      autoSave: 'Save the buffer to disk after a successful run',
      autoDetect: 'Follow the workspace DSH has open (no path edits when you switch folders)',
      detectedWorkspace: 'Detected workspace',
      detectedSession: 'from the current session',
      detectedRegistry: 'from a registered workspace',
      detectedFallback: 'from the host process directory (no session reported)',
      detectedConfig: 'pinned manually',
      useCurrentWorkspace: 'Follow current workspace',
      pinWorkspace: 'Pin to current path',
      workspacePinned: 'Pinned to a manual path — switching folders needs an edit',
      workspaceAuto: 'Auto-detection is on',
      runMode: 'Run',
      workspace: 'Workspace',
      matlabRuntime: 'MATLAB',
      output: 'Output',
      modeSession: 'Persistent session (fast, figures open)',
      modeBatch: 'Batch (cold start each run, no window)',
      configPath: 'Config file',
      saveConfig: 'Save config',
      configSaved: 'Config saved',
      saved: 'Saved',
      autoSaved: 'Autosaved',
      mlxReadOnly: 'live script · read-only preview',
      saveHint: 'File name (without .m)',
      runError: 'Run failed: {message}',
      shortcut: 'Open MATLAB runner',
      files: 'Script',
      newScript: 'New',
      session: 'Session',
      sessionRunning: 'Session running',
      sessionIdle: 'Session not started',
      restartSession: 'Restart session',
      stopSession: 'Close session',
      sessionRestarted: 'MATLAB session restarted',
      artifacts: 'Figures',
      openArtifact: 'Open the image in a new tab',
      open: 'Open',
      tree: 'Files',
      treeTitle: 'Browse the workspace',
      up: 'Up',
      refresh: 'Refresh',
      unsaved: 'unsaved',
      draft: 'draft',
      variables: 'Variables',
      noVars: 'No variables yet — run a script first.',
      noSessionVars: 'The session is not running yet — run a script first.',
      value: 'Value',
      saveInfo: 'Saving and drafts',
      saveInfoFile: 'Opened file: Save and auto-save overwrite that file in place, no copies.',
      saveInfoDraft: 'Draft (＋ new, not yet named): saved to <scriptDir>/<name>.m only when you press Save.',
      saveInfoBuffer: 'Unsaved edits live in browser localStorage (dsh.matlab-runner.buffers), so reloading or switching files keeps them.',
      helpInfo: 'What everything does',
      helpRun: '▶ Run / Cmd·Ctrl+Enter: runs the buffer; a real file runs in place, so relative paths resolve next to the script.',
      helpStop: '■ Stop: kills the current run; session mode restarts, so the next run waits 6-9 s for boot.',
      helpSave: 'Save: overwrites a real file; saves a draft into the script directory.',
      helpPicker: 'Script picker: switch between saved scripts; "unsaved" entries are drafts.',
      helpNew: '＋ New: starts a draft buffer; the previous buffer is kept by name.',
      helpTree: 'Files: the tree, click folders to expand and files to open; header has ↑ parent / refresh.',
      helpVars: 'Variables: the lower half of the left column mirrors the MATLAB workspace (name / value / class / size), refreshed after each run.',
      helpSplit: 'Drag: between tree and variables, between the left column and the editor, and between editor and console.',
      helpSession: 'Session badge: green dot = the persistent session is alive; grey = not started (the first run boots it).',
      savedOverwrite: 'Overwrote {path}',
      roots: 'Folders',
      addRoot: '＋ Folder…',
      addRootHint: 'Absolute path, e.g. ~/Documents/project',
      addRootOk: 'Mount',
      cancel: 'Cancel',
      removeRoot: 'Remove',
      rootAdded: 'Mounted: {path}',
      rootRemoved: 'Removed: {path}',
      varEditor: 'Variable',
      varHint: 'Saving assigns this line back into the MATLAB base workspace, e.g. [1 2; 3 4], \'text\', magic(3)',
      varSave: 'Write back',
      varCancel: 'Close',
      varSaved: 'Wrote back {name}',
      varDblHint: 'Double-click a variable to inspect or edit it',
      savedAs: 'Saved as {path}',
      refreshVars: 'Refresh variables',
      binary: 'Not a text file, cannot open in the editor',
      name: 'Name',
      cls: 'Class',
      size: 'Size',
      bytes: 'Bytes',
      unsavedChanges: 'Unsaved edits are kept in the draft'
    }

    const dictionaries = { zh, en }

    /** Fallback translator when the framework's `t` prop is absent. */
    function fallbackT(key) {
      const dict = (typeof navigator === 'object' && /^zh/.test(navigator.language || '')) ? zh : en
      return dict[key] ?? key
    }

    /** Format a translator output with {name} placeholders. */
    function fill(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined ? '' : String(values[key])))
    }

    /** Workspace root of the panel's own session, reported by the host. */
    let activeCwd = ''

    /** Adopt the session workspace the tab belongs to. */
    function setActiveCwd(cwd) {
      activeCwd = typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : ''
    }

    /** Append the workspace so the host can follow the folder the user opened. */
    function withWorkspace(path) {
      if (activeCwd === '') return path
      const separator = path.includes('?') ? '&' : '?'
      return `${path}${separator}cwd=${encodeURIComponent(activeCwd)}`
    }

    /** One JSON call against the host half; unwraps the {ok,value} envelope. */
    async function call(path, body) {
      const init = body === undefined
        ? { method: 'GET', headers: { accept: 'application/json' } }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body)
          }
      const response = await fetch(`matlab/api/${withWorkspace(path)}`, init)
      const payload = await response.json()
      if (payload.ok !== true) {
        const message = payload?.error?.message ?? payload?.error ?? `HTTP ${response.status}`
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
      }
      return payload.value
    }

    /** Last path segment, for narrow chrome. */
    function shortName(path) {
      const text = String(path ?? '')
      const parts = text.split('/')
      return parts[parts.length - 1] || text
    }

    /** URL of one artifact's bytes (served by the host half). */
    function artifactUrl(path) {
      return `matlab/api/artifact?path=${encodeURIComponent(path)}`
    }

    /** Inject the panel stylesheet once per document. */
    function ensureStyles() {
      if (document.getElementById('dsh-matlab-runner-css') !== null) return
      const style = document.createElement('style')
      style.id = 'dsh-matlab-runner-css'
      style.textContent = `
/* VS Code-ish surfaces: tokens live on the root so the panel follows the host theme. */
.mrun-root {
  --mrun-fg: inherit;
  --mrun-muted: rgba(120,120,128,.95);
  --mrun-border: rgba(127,127,127,.30);
  --mrun-border-soft: rgba(127,127,127,.16);
  --mrun-bg-soft: rgba(127,127,127,.07);
  --mrun-bg-hover: rgba(127,127,127,.14);
  --mrun-accent: #0a7aff;
  --mrun-ok: #2ea043;
  --mrun-bad: #d13438;
  --mrun-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  position:relative;
  display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0; min-width:0; text-align:left;
  font: 12px/1.45 ui-sans-serif, -apple-system, "Segoe UI", "PingFang SC", sans-serif;
  color: var(--mrun-fg);
}
/* --- top toolbar: segmented groups, VS Code spacing ---------------------- */
.mrun-toolbar { display:flex; align-items:center; gap:6px; padding:5px 8px; flex:none; flex-wrap:wrap; border-bottom:1px solid var(--mrun-border); background: var(--mrun-bg-soft); }
.mrun-group { display:flex; align-items:center; gap:2px; padding:1px; border:1px solid transparent; border-radius:7px; }
.mrun-group + .mrun-group { border-left:1px solid var(--mrun-border-soft); padding-left:6px; margin-left:2px; }
.mrun-spacer { flex:1 1 auto; }
.mrun-btn { display:inline-flex; align-items:center; justify-content:center; gap:5px; height:24px; padding:0 9px; border-radius:5px; border:1px solid transparent; background:transparent; color:var(--mrun-fg); font:inherit; font-size:11.5px; cursor:pointer; white-space:nowrap; }
.mrun-btn:hover:not(:disabled) { background: var(--mrun-bg-hover); }
.mrun-btn:focus-visible { outline:1px solid var(--mrun-accent); outline-offset:1px; }
.mrun-btn:disabled { opacity:.4; cursor:default; }
.mrun-btn[data-primary="true"] { background: var(--mrun-accent); border-color: var(--mrun-accent); color:#fff; }
.mrun-btn[data-primary="true"]:hover:not(:disabled) { filter: brightness(1.05); background: var(--mrun-accent); }
.mrun-btn[data-on="true"] { background: var(--mrun-bg-hover); border-color: var(--mrun-border-soft); }
.mrun-btn[data-icon="true"] { padding:0 7px; }
.mrun-select { height:24px; max-width:188px; padding:0 6px; border-radius:5px; border:1px solid var(--mrun-border); background:transparent; color:inherit; font:inherit; font-size:11.5px; }
.mrun-badge { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:999px; border:1px solid var(--mrun-border); font-size:10.5px; color:var(--mrun-muted); white-space:nowrap; }
.mrun-badge[data-live="true"] { border-color: rgba(46,160,67,.55); color: var(--mrun-ok); }
/* --- editor / console --------------------------------------------------- */
.mrun-body { display:flex; flex:1 1 auto; min-height:0; }
.mrun-pane { display:flex; flex-direction:column; flex:1 1 auto; min-height:96px; overflow:hidden; }
.mrun-editor { display:flex; flex:1 1 55%; min-height:96px; overflow:hidden; position:relative; }
.mrun-gutter { flex:none; padding:8px 8px 8px 10px; overflow:hidden; text-align:right; white-space:pre; user-select:none; color:var(--mrun-muted); background: var(--mrun-bg-soft); border-right:1px solid var(--mrun-border-soft); font-family: var(--mrun-mono); font-size:12px; line-height:18px; }
.mrun-code-wrap { position:relative; flex:1 1 auto; min-width:0; overflow:hidden; }
.mrun-highlight { position:absolute; inset:0; margin:0; padding:8px 10px; overflow:hidden; white-space:pre; pointer-events:none; font-family: var(--mrun-mono); font-size:12px; line-height:18px; tab-size:2; color:inherit; }
.mrun-code { position:absolute; inset:0; width:100%; height:100%; box-sizing:border-box; padding:8px 10px; border:0; outline:none; resize:none; background:transparent; color:inherit; font-family: var(--mrun-mono); font-size:12px; line-height:18px; white-space:pre; overflow:auto; tab-size:2; -webkit-text-fill-color: transparent; caret-color:#0b62d8; }
.mrun-code::selection { background: rgba(70,150,255,.32); }
.mrun-split { flex:none; height:5px; cursor:row-resize; background:var(--mrun-bg-soft); border-top:1px solid var(--mrun-border-soft); border-bottom:1px solid var(--mrun-border-soft); }
.mrun-split:hover, .mrun-split[data-dragging="true"] { background: rgba(10,122,255,.45); }
.mrun-console { display:flex; flex-direction:column; flex:1 1 45%; min-height:80px; overflow:hidden; border-top:1px solid var(--mrun-border-soft); }
.mrun-console-head { display:flex; align-items:center; gap:8px; height:24px; padding:0 10px; flex:none; border-bottom:1px solid var(--mrun-border-soft); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--mrun-muted); background: var(--mrun-bg-soft); }
.mrun-console-head .mrun-spacer { flex:1 1 auto; }
.mrun-out { flex:1 1 auto; margin:0; padding:8px 10px; overflow:auto; white-space:pre-wrap; word-break:break-word; font-family: var(--mrun-mono); font-size:11.5px; line-height:17px; background: transparent; }
.mrun-out[data-phase="failed"] { background: rgba(209,52,56,.09); }
.mrun-console-hint { padding:5px 10px; border-top:1px dashed var(--mrun-border); }
.mrun-statusbar { flex:none; display:flex; align-items:center; gap:10px; height:22px; padding:0 10px; border-top:1px solid var(--mrun-border); background: var(--mrun-bg-soft); font-size:10.5px; color:var(--mrun-muted); white-space:nowrap; overflow:hidden; }
.mrun-dot { width:7px; height:7px; border-radius:50%; background:var(--mrun-muted); flex:none; }
.mrun-dot[data-phase="running"] { background: var(--mrun-accent); animation: mrun-pulse 1s ease-in-out infinite; }
.mrun-dot[data-phase="exited"] { background: var(--mrun-ok); }
.mrun-dot[data-phase="failed"] { background: var(--mrun-bad); }
@keyframes mrun-pulse { 50% { opacity:.35; } }
.mrun-elide { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.mrun-note { padding:6px 10px; font-size:11px; color: var(--mrun-bad); flex:none; }
.mrun-artifacts { flex:none; display:flex; gap:8px; padding:7px 10px; overflow-x:auto; border-top:1px solid var(--mrun-border-soft); background: var(--mrun-bg-soft); }
.mrun-thumb { display:flex; flex-direction:column; align-items:center; gap:3px; text-decoration:none; color:inherit; font-size:10px; max-width:120px; }
.mrun-thumb img { max-height:64px; max-width:116px; border-radius:4px; border:1px solid var(--mrun-border); background:#fff; }
.mrun-thumb span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:116px; opacity:.8; }
/* --- file tree (VS Code explorer) --------------------------------------- */
.mrun-tree { flex:none; min-width:120px; max-width:70%; display:flex; flex-direction:column; border-right:1px solid var(--mrun-border); background: var(--mrun-bg-soft); }
.mrun-tree-head { display:flex; align-items:center; gap:3px; height:26px; padding:0 5px; flex:none; min-width:0; overflow:hidden; border-bottom:1px solid var(--mrun-border-soft); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--mrun-muted); }
.mrun-tree-head .mrun-spacer { flex:1 1 auto; }
.mrun-tree-head .mrun-btn { height:20px; padding:0 4px; font-size:10.5px; flex:0 0 auto; }
.mrun-tree-head .mrun-roots-wrap { flex:1 1 auto; min-width:34px; display:flex; }
.mrun-tree-head .mrun-roots-wrap select { flex:1 1 auto; min-width:0; }
.mrun-tree-list { flex:1 1 auto; overflow:auto; padding:2px 2px 10px; }
.mrun-tree-row { display:flex; align-items:center; gap:4px; height:22px; padding:0 6px; border-radius:4px; cursor:pointer; white-space:nowrap; overflow:hidden; font-family: var(--mrun-mono); font-size:11.5px; }
.mrun-tree-row:hover { background: var(--mrun-bg-hover); }
.mrun-tree-row[data-active="true"] { background: rgba(10,122,255,.16); }
.mrun-tree-row[data-kind="dir"] { color: var(--mrun-fg); }
.mrun-tree-row[data-muted="true"] { opacity:.45; }
.mrun-tree-row .mrun-tri { flex:none; width:11px; text-align:center; font-size:9px; opacity:.8; }
.mrun-tree-row span.mrun-tree-name { overflow:hidden; text-overflow:ellipsis; }
.mrun-tree-head select.mrun-roots { width:100%; height:20px; min-width:0; font-size:11px; letter-spacing:normal; text-transform:none; padding:0 2px; }
.mrun-add-root { display:flex; align-items:center; gap:4px; padding:4px 6px; flex:none; border-bottom:1px solid var(--mrun-border-soft); background: var(--mrun-bg-soft); }
.mrun-add-root input { flex:1 1 auto; min-width:0; height:20px; font-family: var(--mrun-mono); font-size:11px; }
/* --- variable editor modal (double-click a row) ------------------------- */
.mrun-modal { position:absolute; inset:0; z-index:20; display:flex; align-items:center; justify-content:center; padding:16px;
  background: rgba(0,0,0,.28); }
.mrun-modal-box { display:flex; flex-direction:column; width:min(560px,100%); max-height:100%; background:#fff; color:#1f2328;
  border:1px solid var(--mrun-border); border-radius:8px; box-shadow: 0 12px 32px rgba(0,0,0,.22); overflow:hidden; }
@media (prefers-color-scheme: dark) { .mrun-modal-box { background:#252a31; color:#e6edf3; } }
.mrun-modal-head { display:flex; align-items:center; gap:8px; height:30px; padding:0 10px; flex:none; border-bottom:1px solid var(--mrun-border-soft);
  font-size:11.5px; }
.mrun-modal-head .mrun-modal-title { font-family: var(--mrun-mono); font-weight:600; }
.mrun-modal-body { flex:1 1 auto; min-height:0; display:flex; padding:8px; }
.mrun-modal-body textarea { flex:1 1 auto; min-height:120px; resize:vertical; font-family: var(--mrun-mono); font-size:11.5px;
  border:1px solid var(--mrun-border); border-radius:5px; padding:6px; background: var(--mrun-bg-soft); color: inherit; }
.mrun-modal-foot { display:flex; align-items:center; gap:6px; padding:8px 10px; flex:none; border-top:1px solid var(--mrun-border-soft); }
.mrun-modal-foot .mrun-hint { flex:1 1 auto; }
.mrun-vars-row[data-editable="true"] { cursor:pointer; }
.mrun-vsplit { flex:none; width:6px; cursor:col-resize; background:var(--mrun-bg-hover); border-left:1px solid var(--mrun-border); border-right:1px solid var(--mrun-border); }
.mrun-run-check .mrun-btn, .mrun-row-check .mrun-btn, .mrun-actions .mrun-btn { border-color: var(--mrun-border); }
.mrun-vsplit:hover, .mrun-vsplit[data-dragging="true"] { background: rgba(10,122,255,.42); }
/* --- variables (MATLAB workspace panel) --------------------------------- */
.mrun-vars { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; background: var(--mrun-bg-soft); }
.mrun-vars-head { display:flex; align-items:center; gap:6px; height:26px; padding:0 8px; flex:none; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--mrun-muted); border-bottom:1px solid var(--mrun-border-soft); }
.mrun-vars-head .mrun-spacer { flex:1 1 auto; }
.mrun-vars-head .mrun-btn { height:20px; padding:0 6px; font-size:10.5px; }
.mrun-vars-list { overflow:auto; padding-bottom:4px; }
.mrun-vars-row { display:grid; grid-template-columns: minmax(0,.9fr) minmax(0,1.3fr) 58px 52px; gap:8px; padding:0 8px; height:22px; align-items:center; font-family: var(--mrun-mono); font-size:11px; white-space:nowrap; }
.mrun-vars-row[data-head="true"] { color:var(--mrun-muted); font-family:inherit; font-size:10px; letter-spacing:.05em; text-transform:uppercase; border-bottom:1px solid var(--mrun-border-soft); }
.mrun-vars-row:not([data-head="true"]):hover { background: var(--mrun-bg-hover); }
.mrun-vars-row .mrun-var-value { overflow:hidden; text-overflow:ellipsis; color:var(--mrun-fg); opacity:.85; }
.mrun-vars-row[data-head="true"] .mrun-var-value { opacity:1; }
/* Left column: file tree on top, workspace variables underneath, drag the bar between them. */
.mrun-side { display:flex; flex-direction:column; flex:none; min-width:140px; max-width:70%; background: var(--mrun-bg-soft); }
.mrun-side .mrun-tree { flex:1 1 auto; min-height:0; min-width:0; max-width:none; border-right:0; }
.mrun-side-vars { flex:0 0 auto; min-height:70px; display:flex; flex-direction:column; border-top:1px solid var(--mrun-border); }
.mrun-hsplit { flex:none; height:6px; cursor:row-resize; background: var(--mrun-bg-hover); border-top:1px solid var(--mrun-border); border-bottom:1px solid var(--mrun-border); }
.mrun-hsplit:hover { background: var(--mrun-accent); }
/* Breadcrumb: where the panel currently points, and where a save would land. */
.mrun-crumb { display:flex; align-items:center; gap:2px; height:24px; flex:none; padding:0 8px; overflow:hidden; white-space:nowrap;
  border-bottom:1px solid var(--mrun-border-soft); font-family: var(--mrun-mono); font-size:11px; color:var(--mrun-muted); background: var(--mrun-bg-soft); }
.mrun-crumb-seg { padding:1px 4px; border-radius:4px; cursor:pointer; }
.mrun-crumb-seg:hover { background: var(--mrun-bg-hover); color:var(--mrun-fg); }
.mrun-crumb-seg[data-active="true"] { color: var(--mrun-fg); }
.mrun-crumb-sep { opacity:.5; }
.mrun-help-line { font-size:11px; line-height:1.55; color:var(--mrun-muted); padding:2px 0; }
.mrun-help-line code { font-family: var(--mrun-mono); font-size:10.5px; background: var(--mrun-bg-soft); padding:0 3px; border-radius:3px; }
.mrun-var-name { overflow:hidden; text-overflow:ellipsis; }
.mrun-var-cls { opacity:.75; }
.mrun-var-size { opacity:.75; text-align:right; }
.mrun-hint { font-size:11px; color:var(--mrun-muted); word-break:break-all; }
/* --- settings: label/control grid, everything left aligned -------------- */
.mrun-settings { display:flex; flex-direction:column; gap:14px; padding:14px 16px 18px; overflow:auto; flex:1 1 auto; }
.mrun-section { display:flex; flex-direction:column; gap:8px; }
.mrun-section-head { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--mrun-muted); padding-bottom:5px; border-bottom:1px solid var(--mrun-border-soft); }
.mrun-grid { display:grid; grid-template-columns: 132px minmax(0,1fr); gap:8px 12px; align-items:center; }
.mrun-row { display:contents; }
.mrun-row-label { font-size:11.5px; color:var(--mrun-fg); text-align:left; }
.mrun-row-control { min-width:0; text-align:left; }
.mrun-row-control input, .mrun-row-control select { width:100%; box-sizing:border-box; height:26px; padding:0 7px; border-radius:5px; border:1px solid var(--mrun-border); background:transparent; color:inherit; font-family: var(--mrun-mono); font-size:11.5px; }
.mrun-row-control select { font-family:inherit; }
.mrun-row-control input:focus, .mrun-row-control select:focus { outline:none; border-color: var(--mrun-accent); }
.mrun-row-check { display:flex; grid-column: 1 / -1; align-items:center; gap:8px; justify-content:flex-start; text-align:left; cursor:pointer; }
.mrun-row-check input { width:14px; height:14px; margin:0; flex:none; accent-color: var(--mrun-accent); }
.mrun-row-check span { font-size:11.5px; color:var(--mrun-fg); text-align:left; }
.mrun-actions { display:flex; gap:6px; flex-wrap:wrap; }
.mrun-actions .mrun-btn { border-color: var(--mrun-border); }
.mrun-path-line { display:flex; align-items:center; gap:6px; padding:5px 8px; border:1px solid var(--mrun-border-soft); border-radius:5px; background: var(--mrun-bg-soft); font-family: var(--mrun-mono); font-size:11px; word-break:break-all; }
.mrun-path-line .mrun-elide { flex:1 1 auto; }
/* --- .mlx preview ------------------------------------------------------- */
.mrun-mlx { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; }
.mrun-mlx-head { display:flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-bottom:1px solid var(--mrun-border); font-size:11px; background: var(--mrun-bg-soft); }
.mrun-mlx-body { flex:1 1 auto; overflow:auto; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
.mrun-mlx-text { font-size:12px; line-height:1.55; }
.mrun-mlx-heading { font-weight:600; margin:4px 0 2px; }
.mrun-mlx-h1 { font-size:15px; }
.mrun-mlx-h2 { font-size:13.5px; }
.mrun-mlx-h3 { font-size:12.5px; opacity:.92; }
.mrun-mlx-h4 { font-size:12px; opacity:.86; }
.mrun-mlx-code { margin:0; padding:8px 10px; border-radius:6px; background: var(--mrun-bg-soft); border:1px solid var(--mrun-border-soft); white-space:pre; overflow:auto; font-family: var(--mrun-mono); font-size:11.5px; line-height:17px; }
.mrun-mlx-out { margin:0; padding:6px 10px; border-left:2px solid var(--mrun-border); white-space:pre-wrap; font-family: var(--mrun-mono); font-size:11px; opacity:.92; }
.mrun-mlx-img { max-width:100%; border-radius:6px; border:1px solid var(--mrun-border-soft); background:#fff; }
/* --- syntax colours ----------------------------------------------------- */
.tk-kw { color:#0b62d8; font-weight:600; }
.tk-str { color:#1f8a4c; }
.tk-com { color:#8a8a8a; font-style:italic; }
.tk-num { color:#b5651d; }
@media (prefers-color-scheme: dark) {
  .mrun-root { --mrun-bg-soft: rgba(255,255,255,.05); --mrun-bg-hover: rgba(255,255,255,.09); }
  .tk-kw { color:#7cb7ff; }
  .tk-str { color:#89d185; }
  .tk-com { color:#8b949e; }
  .tk-num { color:#e3b341; }
  .mrun-code { caret-color:#7cb7ff; }
}
`
      document.head.appendChild(style)
    }

    /** The tab type's static registry definition. */
    function definition(t) {
      return {
        id: ID,
        kind: KIND,
        priority: 'extension',
        title: () => t('type.label'),
        guide: [{
          id: 'matlab',
          order: 60,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: () => h('span', { 'aria-hidden': true, style: { fontSize: '13px', lineHeight: 1 } }, '▤')
        }]
      }
    }

    /** One row of the file tree. */
    function TreeRow(props) {
      const { entry, depth, active, expanded, onToggle, onOpen } = props
      const isDir = entry.type === 'dir'
      return h('div', {
        className: 'mrun-tree-row',
        'data-kind': entry.type,
        'data-active': String(active),
        'data-muted': String(!isDir && entry.editable === false),
        style: { paddingLeft: `${4 + depth * 12}px` },
        title: entry.path,
        onClick: () => (isDir ? onToggle(entry) : onOpen(entry))
      },
      h('span', { className: 'mrun-tri' }, isDir ? (expanded ? '▾' : '▸') : ''),
      h('span', { className: 'mrun-tree-name' }, entry.name))
    }

    /** MATLAB words the highlighter paints as keywords. */
    const KEYWORDS = new Set([
      'arguments', 'break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif',
      'end', 'enumeration', 'events', 'for', 'function', 'global', 'if', 'methods',
      'otherwise', 'parfor', 'persistent', 'properties', 'return', 'spmd', 'switch',
      'try', 'while'
    ])

    /**
     * Split one MATLAB line into `{ text, cls }` runs: comment (`%`), string
     * (single or double quotes, doubled quotes escape), number, keyword, plain.
     */
    function tokenizeLine(line) {
      const tokens = []
      let plain = ''
      const flush = () => {
        if (plain !== '') {
          tokens.push({ text: plain })
          plain = ''
        }
      }
      const push = (text, cls) => {
        if (text === '') return
        flush()
        tokens.push({ text, cls })
      }
      let index = 0
      while (index < line.length) {
        const ch = line[index]
        if (ch === '%') {
          push(line.slice(index), 'com')
          break
        }
        if (ch === '"') {
          let end = index + 1
          while (end < line.length) {
            if (line[end] === '"') {
              if (line[end + 1] === '"') { end += 2; continue }
              break
            }
            end += 1
          }
          const stop = Math.min(end + 1, line.length)
          push(line.slice(index, stop), 'str')
          index = stop
          continue
        }
        if (ch === "'") {
          // A quote right after a value is the transpose operator, not a string.
          const previous = line[index - 1]
          const opensString = previous === undefined || !/[A-Za-z0-9_)\]}.'"]/.test(previous)
          if (opensString) {
            let end = index + 1
            while (end < line.length) {
              if (line[end] === "'") {
                if (line[end + 1] === "'") { end += 2; continue }
                break
              }
              end += 1
            }
            const stop = Math.min(end + 1, line.length)
            push(line.slice(index, stop), 'str')
            index = stop
            continue
          }
        }
        if (/[0-9]/.test(ch) && !/[A-Za-z_]/.test(line[index - 1] ?? '')) {
          const matched = /^[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?/.exec(line.slice(index))
          if (matched !== null) {
            push(matched[0], 'num')
            index += matched[0].length
            continue
          }
        }
        if (/[A-Za-z_]/.test(ch)) {
          const matched = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(index))
          const word = matched[0]
          if (KEYWORDS.has(word)) push(word, 'kw')
          else plain += word
          index += word.length
          continue
        }
        plain += ch
        index += 1
      }
      flush()
      return tokens
    }

    /** The colour layer painted underneath the transparent textarea. */
    function tokenSpans(code) {
      const lines = code.split('\n')
      const children = []
      lines.forEach((line, lineIndex) => {
        if (lineIndex > 0) children.push('\n')
        for (const token of tokenizeLine(line)) {
          children.push(h('span', {
            key: `${lineIndex}:${children.length}`,
            className: token.cls === undefined ? undefined : `tk-${token.cls}`
          }, token.text))
        }
      })
      return children
    }

    /** Colour layer painted underneath the transparent textarea. */
    function highlightLayer(code, highlightRef) {
      return h('pre', { className: 'mrun-highlight', 'aria-hidden': true, ref: highlightRef }, tokenSpans(code))
    }

    /** One rendered .mlx live-script section (read-only preview). */
    function mlxSection(section, index, images, t) {
      const key = `mlx-${index}`
      if (section.type === 'code') {
        return h('pre', { key, className: 'mrun-mlx-code' }, tokenSpans(section.text ?? ''))
      }
      if (section.type === 'output') {
        const image = section.image === undefined ? undefined : images.get(section.image)
        return h('div', { key, className: 'mrun-mlx-out' },
          image !== undefined
            ? h('img', { className: 'mrun-mlx-img', src: image.dataUrl, alt: image.name })
            : h('span', null, section.text ?? ''))
      }
      return h('div', { key, className: 'mrun-mlx-text' }, (section.text ?? '').split('\n').map((line, lineIndex) => {
        const heading = /^(#{1,4})\s+(.*)$/.exec(line)
        if (heading !== null) {
          return h('div', { key: `${index}:${lineIndex}`, className: `mrun-mlx-heading mrun-mlx-h${heading[1].length}` }, heading[2])
        }
        return h('div', { key: `${index}:${lineIndex}` }, line)
      }))
    }

    /** Console + status line, shared by both panes. */
    function consoleView(props) {
      const { snapshot, outputRef, figures, t } = props
      const hint = snapshot?.hint
      const phase = snapshot?.status === 'running' || snapshot?.status === 'stopping'
        ? 'running'
        : snapshot?.status === 'exited'
          ? 'exited'
          : snapshot?.status === 'failed'
            ? 'failed'
            : 'idle'
      const text = [snapshot?.output, snapshot?.error].filter((part) => part !== undefined && part !== '').join('\n')
      const artifacts = snapshot?.artifacts ?? []
      return h(react.Fragment, null,
        h('pre', {
          className: 'mrun-out',
          'data-phase': phase,
          'data-mrun-output': true,
          ref: outputRef
        }, text === '' ? t('empty') : text),
        hint === undefined || hint === ''
          ? null
          : h('div', { className: 'mrun-hint mrun-console-hint', 'data-mrun-hint': true }, hint),
        figures && artifacts.length > 0
          ? h('div', { className: 'mrun-artifacts', 'data-mrun-artifacts': true },
            artifacts.map((artifact) => h('a', {
              key: artifact.path,
              className: 'mrun-thumb',
              href: artifactUrl(artifact.path),
              target: '_blank',
              rel: 'noreferrer',
              title: `${t('openArtifact')}: ${artifact.path}`
            },
            h('img', { src: artifactUrl(artifact.path), alt: artifact.name, loading: 'lazy' }),
            h('span', null, artifact.name))))
          : null,
        h('div', { className: 'mrun-statusbar', 'data-mrun-statusbar': true },
          h('span', { className: 'mrun-dot', 'data-phase': phase }),
          h('span', { 'data-mrun-phase': phase }, phase === 'running' ? t('running') : phase === 'exited' ? t('exited') : phase === 'failed' ? t('failed') : t('idle')),
          snapshot?.exitCode !== undefined && snapshot?.exitCode !== null
            ? h('span', null, `${t('exit')} ${snapshot.exitCode}`)
            : null,
          snapshot?.timedOut === true ? h('span', null, t('timedOut')) : null,
          snapshot?.elapsedMs !== undefined ? h('span', { className: 'mrun-elide' }, `${t('elapsed')} ${(snapshot.elapsedMs / 1000).toFixed(1)}s`) : null,
          h('span', { className: 'mrun-spacer' }),
          snapshot?.scriptPath !== undefined ? h('span', { className: 'mrun-elide', title: snapshot.scriptPath }, snapshot.scriptPath) : null))
    }

    /** `whos` snapshot: name / class / size, refreshed from the live session. */
    function varsView(props) {
      const { vars, t, onRefresh, sessionLive, onOpen } = props
      const rows = vars?.vars ?? []
      return h('div', { className: 'mrun-vars', 'data-mrun-vars': true },
        h('div', { className: 'mrun-vars-head' },
          h('span', null, rows.length === 0 ? t('variables') : `${t('variables')} (${rows.length})`),
          h('span', { className: 'mrun-spacer' }),
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-refresh-vars': true,
            title: `${t('refreshVars')} · ${t('varDblHint')}`,
            onClick: onRefresh
          }, '⟳')),
        h('div', { className: 'mrun-vars-list' },
          h('div', { className: 'mrun-vars-row', 'data-head': 'true' },
            h('span', { className: 'mrun-var-name' }, t('name')),
            h('span', { className: 'mrun-var-value' }, t('value')),
            h('span', { className: 'mrun-var-cls' }, t('cls')),
            h('span', { className: 'mrun-var-size' }, t('size'))),
          rows.length === 0
            ? h('div', { className: 'mrun-hint', style: { padding: '4px 8px 8px' } },
              sessionLive ? t('noVars') : t('noSessionVars'))
            : rows.map((row) => h('div', {
              key: row.name,
              className: 'mrun-vars-row',
              'data-mrun-var-row': row.name,
              'data-editable': 'true',
              onDoubleClick: () => (typeof onOpen === 'function' ? onOpen(row.name) : undefined),
              title: `${row.name} = ${row.value ?? ''} · ${row.cls} ${(row.size ?? []).join('×')} · ${row.bytes} B\n${t('varDblHint')}`
            },
            h('span', { className: 'mrun-var-name' }, row.name),
            h('span', { className: 'mrun-var-value', title: row.value ?? '' }, row.value ?? ''),
            h('span', { className: 'mrun-var-cls' }, row.cls),
            h('span', { className: 'mrun-var-size' }, (row.size ?? []).join('×'))))))
    }

    /** The tab body: editor, file tree, variables, settings. */
    function Body(props) {
      const { useTabInfo, useSessions, sessionId } = props
      const t = typeof props.t === 'function' ? props.t : fallbackT
      ensureStyles()
      if (typeof useTabInfo === 'function') useTabInfo()
      // The hosting session tells us which folder the user has open; passing it on
      // every call is what makes switching workspaces work without editing config.
      const sessionCwd = typeof useSessions === 'function'
        ? useSessions((sessions) => sessions?.byId?.[sessionId]?.cwd)
        : undefined
      if (typeof sessionCwd === 'string' && sessionCwd !== '') setActiveCwd(sessionCwd)

      const initialKey = localStorage.getItem(ACTIVE_KEY) ?? ''
      const initialBuffers = readBuffers()
      const initial = initialBuffers[initialKey] ?? {}

      const [code, setCode] = react.useState(initial.code ?? localStorage.getItem(CODE_KEY) ?? SAMPLE)
      const [name, setName] = react.useState(initial.name ?? localStorage.getItem(NAME_KEY) ?? 'scratch')
      const [bufferKey, setBufferKey] = react.useState(initialKey)
      const [, setBuffersTick] = react.useState(0)
      const [snapshot, setSnapshot] = react.useState(undefined)
      const [notice, setNotice] = react.useState('')
      const [view, setView] = react.useState(typeof props.initialView === 'string' ? props.initialView : 'editor')
      const [probe, setProbe] = react.useState(undefined)
      const [draft, setDraft] = react.useState(undefined)
      const [saving, setSaving] = react.useState(false)
      const [scripts, setScripts] = react.useState([])
      const [tree, setTree] = react.useState(undefined)
      const [expanded, setExpanded] = react.useState({})
      const [showTree, setShowTree] = react.useState(() => readFlag('dsh.matlab-runner.showTree', false))
      const [vars, setVars] = react.useState(undefined)
      const [showVars, setShowVars] = react.useState(() => readFlag('dsh.matlab-runner.showVars', false))
      const [mlx, setMlx] = react.useState(undefined)
      const [consoleHeight, setConsoleHeight] = react.useState(() => Number(localStorage.getItem(CONSOLE_KEY) ?? '0') || 0)
      const [treeWidth, setTreeWidth] = react.useState(() => Number(localStorage.getItem(TREE_WIDTH_KEY) ?? '0') || 240)
      const [varsHeight, setVarsHeight] = react.useState(() => Number(localStorage.getItem('dsh.matlab-runner.varsHeight') ?? '0') || 190)
      const [roots, setRoots] = react.useState(undefined)
      const [addingRoot, setAddingRoot] = react.useState(false)
      const [rootInput, setRootInput] = react.useState('')
      const [varEditor, setVarEditor] = react.useState(undefined)
      const [varText, setVarText] = react.useState('')
      const [varSaving, setVarSaving] = react.useState(false)
      const sideRef = react.useRef(null)
      const varsHeightRef = react.useRef(varsHeight)
      varsHeightRef.current = varsHeight

      const runIdRef = react.useRef(undefined)
      const pollRef = react.useRef(undefined)
      const outputRef = react.useRef(null)
      const codeRef = react.useRef(null)
      const gutterRef = react.useRef(null)
      const highlightRef = react.useRef(null)
      const paneRef = react.useRef(null)
      const bodyRef = react.useRef(null)
      const keyRef = react.useRef(bufferKey)
      const nameRef = react.useRef(name)
      const probeRef = react.useRef(undefined)
      keyRef.current = bufferKey
      nameRef.current = name
      probeRef.current = probe

      const stopPolling = react.useCallback(() => {
        if (pollRef.current !== undefined) {
          clearInterval(pollRef.current)
          pollRef.current = undefined
        }
      }, [])

      const refreshState = react.useCallback(async () => {
        try {
          const value = await call('state')
          setProbe(value)
          setDraft((current) => (current === undefined ? value.config : current))
        } catch {
          /* the panel still works off the last known probe */
        }
      }, [])

      const refreshScripts = react.useCallback(async () => {
        try {
          const value = await call('scripts')
          setScripts(value.scripts ?? [])
        } catch {
          /* the picker just stays empty */
        }
      }, [])

      const refreshRoots = react.useCallback(async () => {
        try {
          setRoots(await call('roots'))
        } catch {
          /* the picker falls back to the workspace root */
        }
      }, [])

      const loadTree = react.useCallback(async (path) => {
        try {
          const value = await call(path === undefined || path === ''
            ? 'tree'
            : `tree?path=${encodeURIComponent(path)}`)
          setTree(value)
          setExpanded({})
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [])

      const refreshVars = react.useCallback(async (force) => {
        try {
          setVars(await call(force === true ? 'vars?force=1' : 'vars'))
        } catch {
          /* no session yet — the panel shows the empty hint */
        }
      }, [])

      /** Keep the current buffer on disk (localStorage) so switching never loses it. */
      const rememberBuffer = react.useCallback((key, nextCode, nextName) => {
        if (key === '') return
        const map = readBuffers()
        map[key] = { code: nextCode, name: nextName, at: Date.now() }
        localStorage.setItem(BUFFERS_KEY, JSON.stringify(map))
      }, [])

      react.useEffect(() => {
        if (bufferKey !== '') rememberBuffer(bufferKey, code, name)
        localStorage.setItem(ACTIVE_KEY, bufferKey)
        localStorage.setItem(CODE_KEY, code)
        localStorage.setItem(NAME_KEY, name)
        setBuffersTick((value) => value + 1)
      }, [bufferKey, code, name, rememberBuffer])

      react.useEffect(() => {
        if (consoleHeight > 0) localStorage.setItem(CONSOLE_KEY, String(consoleHeight))
      }, [consoleHeight])

      react.useEffect(() => {
        if (treeWidth > 0) localStorage.setItem(TREE_WIDTH_KEY, String(treeWidth))
      }, [treeWidth])

      react.useEffect(() => {
        localStorage.setItem('dsh.matlab-runner.showTree', showTree ? '1' : '0')
      }, [showTree])

      /** Write the buffer back to disk after a clean run (IDE-style autosave). */
      const autoPersist = react.useCallback(async (finished) => {
        if (finished?.status !== 'exited' || finished?.exitCode !== 0) return
        if (probeRef.current?.config?.autoSave === false) return
        const key = keyRef.current
        if (key === '') return
        try {
          if (key.startsWith('draft:')) {
            const saved = await call('save', { code: codeRef.current, name: nameRef.current })
            const map = readBuffers()
            delete map[key]
            localStorage.setItem(BUFFERS_KEY, JSON.stringify(map))
            setBufferKey(saved.path)
            void refreshScripts()
            void loadTree()
            setNotice(`${t('autoSaved')}: ${shortName(saved.path)}`)
          } else {
            const written = await call('file', { path: key, code: codeRef.current })
            setNotice(`${t('autoSaved')}: ${shortName(written.path)}`)
          }
        } catch {
          /* autosave is best effort: a failed write must not eat the run result */
        }
      }, [loadTree, refreshScripts, t])

      const startPolling = react.useCallback((id) => {
        stopPolling()
        pollRef.current = setInterval(async () => {
          try {
            const next = await call(`poll?id=${encodeURIComponent(id)}`)
            setSnapshot(next)
            const pre = outputRef.current
            if (pre !== null && pre !== undefined) pre.scrollTop = pre.scrollHeight
            if (next.status !== 'running' && next.status !== 'stopping') {
              stopPolling()
              void refreshState()
              void refreshVars(false)
              void autoPersist(next)
            }
          } catch (error) {
            stopPolling()
            setNotice(String(error?.message ?? error))
          }
        }, 250)
      }, [autoPersist, refreshVars, refreshState, stopPolling])

      react.useEffect(() => {
        void refreshRoots()
      }, [refreshRoots, sessionCwd])

      react.useEffect(() => () => stopPolling(), [stopPolling])

      react.useEffect(() => {
        let live = true
        call('state').then((value) => {
          if (!live) return
          setProbe(value)
          setDraft(value.config)
          if (value.session?.running === true) void refreshVars(false)
        }).catch((error) => setNotice(String(error?.message ?? error)))
        void refreshScripts()
        void loadTree()
        return () => { live = false }
      }, [loadTree, refreshScripts, refreshVars])

      // Opening another folder in DSH changes the session cwd: re-read the
      // workspace-dependent state so the panel follows it automatically.
      react.useEffect(() => {
        if (typeof sessionCwd !== 'string' || sessionCwd === '') return
        let live = true
        call('state').then((value) => {
          if (!live) return
          setProbe(value)
          setDraft(value.config)
        }).catch(() => {})
        void refreshScripts()
        void loadTree()
        return () => { live = false }
      }, [sessionCwd, loadTree, refreshScripts])

      const run = react.useCallback(async () => {
        setNotice('')
        try {
          rememberBuffer(keyRef.current, code, name)
          // A buffer opened from the tree runs as that file (its own folder is
          // the base for relative paths); drafts still go through the scratch copy.
          const isFile = keyRef.current !== '' && !keyRef.current.startsWith('draft:')
          const started = await call('run', isFile ? { code, name, path: keyRef.current } : { code, name })
          runIdRef.current = started.id
          setSnapshot(started)
          startPolling(started.id)
        } catch (error) {
          setNotice(fill(t('runError'), { message: error?.message ?? error }))
        }
      }, [code, name, rememberBuffer, startPolling, t])

      const stop = react.useCallback(async () => {
        const id = runIdRef.current
        if (id === undefined) return
        try {
          setSnapshot(await call('stop', { id }))
          void refreshVars(false)
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [refreshVars])

      const save = react.useCallback(async () => {
        setSaving(true)
        try {
          const target = keyRef.current
          if (typeof target === 'string' && target !== '' && !target.startsWith('draft:')) {
            // A real file: Save overwrites it, exactly like the editor's ⌘S.
            const written = await call('file', { path: target, code })
            setNotice(fill(t('savedOverwrite'), { path: written.path }))
            const pending = readBuffers()
            delete pending[target]
            localStorage.setItem(BUFFERS_KEY, JSON.stringify(pending))
            void loadTree(tree?.path)
            return
          }
          const saved = await call('save', { code, name })
          setNotice(fill(t('savedAs'), { path: saved.path }))
          const map = readBuffers()
          delete map[keyRef.current]
          localStorage.setItem(BUFFERS_KEY, JSON.stringify(map))
          setBufferKey(saved.path)
          void refreshScripts()
          void loadTree(tree?.path)
        } catch (error) {
          setNotice(fill(t('runError'), { message: error?.message ?? error }))
        } finally {
          setSaving(false)
        }
      }, [code, loadTree, name, refreshScripts, t, tree])

      const openFile = react.useCallback(async (file) => {
        if (file === undefined || file === '') return
        rememberBuffer(keyRef.current, code, name)
        const map = readBuffers()
        const pending = map[file]
        if (pending !== undefined) {
          setBufferKey(file)
          setCode(pending.code)
          setName(pending.name)
          setView('editor')
          return
        }
        setView('editor')
        try {
          const script = await call(`script?path=${encodeURIComponent(file)}`)
          setBufferKey(file)
          setCode(script.code)
          setName(script.name)
          setView('editor')
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [code, name, rememberBuffer])

      const newScript = react.useCallback(() => {
        rememberBuffer(keyRef.current, code, name)
        const id = `draft:${Date.now().toString(36)}`
        // Register the draft right away so the picker lists it on this render.
        rememberBuffer(id, '', 'scratch')
        setBufferKey(id)
        setCode('')
        setName('scratch')
        setSnapshot(undefined)
        setView('editor')
        setNotice(t('unsavedChanges'))
      }, [code, name, rememberBuffer, t])

      const toggleDir = react.useCallback(async (entry) => {
        try {
          const value = await call(`tree?path=${encodeURIComponent(entry.path)}`)
          setExpanded((current) => {
            const next = { ...current }
            if (next[entry.path] !== undefined) delete next[entry.path]
            else next[entry.path] = value.entries
            return next
          })
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [])

      const loadMlx = react.useCallback(async (path) => {
        try {
          setMlx(await call(`mlx?path=${encodeURIComponent(path)}`))
          setView('mlx')
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [])

/** Mount another folder next to the workspace (persisted by the host). */
      const addRoot = react.useCallback(async (folder) => {
        const path = String(folder ?? '').trim()
        if (path === '') return
        try {
          const value = await call('roots', { path })
          setRoots(value)
          setAddingRoot(false)
          setRootInput('')
          const mounted = value.roots[value.roots.length - 1]
          if (mounted !== undefined) {
            void loadTree(mounted.path)
            setNotice(fill(t('rootAdded'), { path: mounted.path }))
          }
          void refreshState()
        } catch (error) {
          setNotice(fill(t('runError'), { message: error?.message ?? error }))
        }
      }, [loadTree, refreshState, t])

      /** Unmount an extra folder. */
      const removeRoot = react.useCallback(async (folder) => {
        try {
          const value = await call('roots', { path: folder, action: 'remove' })
          setRoots(value)
          const home = value.roots?.[0]?.path
          if (home !== undefined) void loadTree(home)
          setNotice(fill(t('rootRemoved'), { path: folder }))
          void refreshState()
        } catch (error) {
          setNotice(fill(t('runError'), { message: error?.message ?? error }))
        }
      }, [loadTree, refreshState, t])

      /** Double-click on a variable: pull its literal and open the editor. */
      const openVariable = react.useCallback(async (variableName) => {
        try {
          const value = await call(`var?name=${encodeURIComponent(variableName)}`)
          setVarText(value.text ?? '')
          setVarEditor(value)
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [])

      /** Write the edited literal back into the MATLAB base workspace. */
      const saveVariable = react.useCallback(async () => {
        if (varEditor === undefined) return
        setVarSaving(true)
        try {
          const value = await call('var', { name: varEditor.name, text: varText })
          setNotice(fill(t('varSaved'), { name: value.name ?? varEditor.name }))
          setVarEditor(undefined)
          void refreshVars(true)
        } catch (error) {
          setNotice(String(error?.message ?? error))
        } finally {
          setVarSaving(false)
        }
      }, [refreshVars, t, varEditor, varText])

      const openTreeEntry = react.useCallback((entry) => {
        if (String(entry.name ?? '').toLowerCase().endsWith('.mlx')) {
          void loadMlx(entry.path)
          return
        }
        if (entry.editable === false) {
          setNotice(`${t('binary')}: ${entry.name}`)
          return
        }
        void openFile(entry.path)
      }, [loadMlx, openFile, t])

      const saveConfig = react.useCallback(async () => {
        setSaving(true)
        try {
          const next = await call('config', draft ?? {})
          setProbe(next)
          setDraft(next.config)
          setNotice(t('configSaved'))
        } catch (error) {
          setNotice(String(error?.message ?? error))
        } finally {
          setSaving(false)
        }
      }, [draft, t])

      /** i18n key for where the detected workspace came from. */
      const detectKey = (source) => {
        if (source === 'session') return 'detectedSession'
        if (source === 'registry') return 'detectedRegistry'
        if (source === 'config') return 'detectedConfig'
        return 'detectedFallback'
      }

      /** Back to automatic: the paths follow whatever folder DSH has open. */
      const followWorkspace = react.useCallback(async () => {
        try {
          const next = await call('config', { autoDetect: true })
          setProbe(next)
          setDraft(next.config)
          setNotice(t('workspaceAuto'))
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [t])

      /** Freeze the paths the panel is using right now (manual mode). */
      const pinWorkspace = react.useCallback(async () => {
        const current = probeRef.current?.config
        try {
          const next = await call('config', {
            autoDetect: false,
            workdir: current?.workdir,
            scriptDir: current?.scriptDir
          })
          setProbe(next)
          setDraft(next.config)
          setNotice(t('workspacePinned'))
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [t])

      const restartSession = react.useCallback(async () => {
        try {
          await call('session/restart', {})
          setNotice(t('sessionRestarted'))
          void refreshState()
        } catch (error) {
          setNotice(String(error?.message ?? error))
        }
      }, [refreshState, t])

      const beginDrag = (event) => {
        event.preventDefault()
        const startY = event.clientY
        const pane = paneRef.current
        const total = pane?.clientHeight ?? 500
        const startHeight = consoleHeight > 0 ? consoleHeight : Math.round(total * 0.45)
        const move = (moveEvent) => {
          const next = Math.max(80, Math.min(startHeight + (startY - moveEvent.clientY), Math.max(120, total - 120)))
          setConsoleHeight(next)
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
      }

      const beginTreeDrag = (event) => {
        event.preventDefault()
        const startX = event.clientX
        const startWidth = treeWidth
        const body = bodyRef.current
        const total = body?.clientWidth ?? 480
        const move = (moveEvent) => {
          const next = Math.max(120, Math.min(startWidth + (moveEvent.clientX - startX), Math.max(160, total * 0.7)))
          setTreeWidth(next)
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
      }

      const beginVarsDrag = (event) => {
        event.preventDefault()
        const startY = event.clientY
        const startHeight = varsHeight
        const side = sideRef.current
        const total = side?.clientHeight ?? 480
        const move = (moveEvent) => {
          const next = Math.max(70, Math.min(startHeight + (startY - moveEvent.clientY), Math.max(110, total - 110)))
          setVarsHeight(next)
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
          try {
            localStorage.setItem('dsh.matlab-runner.varsHeight', String(varsHeightRef.current ?? startHeight))
          } catch {
            /* storage disabled: the height just is not remembered */
          }
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
      }

      const onKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          void run()
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          const target = event.currentTarget
          const start = target.selectionStart
          const end = target.selectionEnd
          const next = `${code.slice(0, start)}  ${code.slice(end)}`
          setCode(next)
          requestAnimationFrame(() => {
            target.selectionStart = start + 2
            target.selectionEnd = start + 2
          })
        }
      }

      const syncScroll = (event) => {
        const top = event.currentTarget.scrollTop
        if (gutterRef.current !== null) gutterRef.current.scrollTop = top
        if (highlightRef.current !== null) {
          highlightRef.current.scrollTop = top
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
        }
      }

      const running = snapshot?.status === 'running' || snapshot?.status === 'stopping'
      const sessionLive = probe?.session?.running === true
      const buffers = readBuffers()
      const draftKeys = Object.keys(buffers).filter((key) => key.startsWith('draft:') || key === '')
      const options = []
      if (bufferKey !== '' && !scripts.some((script) => script.path === bufferKey) && buffers[bufferKey] !== undefined) {
        options.push({ value: bufferKey, label: `${buffers[bufferKey].name || 'scratch'} · ${t('unsaved')}` })
      }
      for (const key of draftKeys) {
        if (key === bufferKey) continue
        options.push({ value: key, label: `${buffers[key].name || 'scratch'} · ${t('draft')}` })
      }
      for (const script of scripts) {
        options.push({ value: script.path, label: shortName(script.name) })
      }
      const selectValue = options.some((option) => option.value === bufferKey) ? bufferKey : ''

      const toolbar = h('div', { className: 'mrun-toolbar' },
        h('div', { className: 'mrun-group' },
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-primary': 'true',
            'data-mrun-run': true,
            disabled: running || view === 'mlx',
            onClick: () => void run(),
            title: '⌘/Ctrl+Enter'
          }, `▶ ${t('run')}`),
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-stop': true,
            disabled: !running,
            onClick: () => void stop()
          }, `■ ${t('stop')}`),
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-save': true,
            disabled: saving || view === 'mlx',
            onClick: () => void save()
          }, t('save'))),
        h('div', { className: 'mrun-group' },
          h('select', {
            className: 'mrun-select',
            'data-mrun-scripts': true,
            value: selectValue,
            title: t('files'),
            onChange: (event) => { void openFile(event.currentTarget.value) }
          },
          h('option', { value: '' }, `${name || 'scratch'}${buffers[bufferKey] === undefined ? '' : ` · ${t('unsaved')}`}`),
          options.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-new': true,
            onClick: newScript
          }, `＋ ${t('newScript')}`)),
        h('div', { className: 'mrun-group' },
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-tree-toggle': true,
            'data-on': String(showTree),
            onClick: () => {
              const next = !showTree
              setShowTree(next)
              writeFlag('dsh.matlab-runner.showTree', next)
              if (next && tree === undefined) void loadTree()
            },
            title: t('treeTitle')
          }, `⌸ ${t('tree')}`),
          h('button', {
            type: 'button',
            className: 'mrun-btn',
            'data-mrun-vars-toggle': true,
            'data-on': String(showVars),
            onClick: () => {
              const next = !showVars
              setShowVars(next)
              writeFlag('dsh.matlab-runner.showVars', next)
              if (next) void refreshVars(true)
            }
          }, `Σ ${t('variables')}`)),
        h('span', { className: 'mrun-spacer' }),
        h('span', {
          className: 'mrun-badge',
          'data-live': String(sessionLive),
          'data-mrun-session': sessionLive ? 'running' : 'idle',
          title: sessionLive ? `${t('sessionRunning')} (pid ${probe?.session?.pid ?? '?'})` : t('sessionIdle')
        }, `● ${t('session')}`),
        h('button', {
          type: 'button',
          className: 'mrun-btn',
          'data-mrun-settings': true,
          'data-on': String(view === 'settings'),
          onClick: () => setView(view === 'settings' ? 'editor' : 'settings')
        }, `⚙ ${t('settings')}`))

      const noticeLine = notice === ''
        ? null
        : h('div', { className: 'mrun-note', role: 'status', 'data-mrun-notice': true }, notice)

      if (view === 'mlx') {
        const images = new Map((mlx?.images ?? []).map((image) => [image.name, image]))
        return h('div', { className: 'mrun-root', 'data-mrun-root': true },
          toolbar,
          noticeLine,
          h('div', { className: 'mrun-mlx', 'data-mrun-mlx': true },
            h('div', { className: 'mrun-mlx-head' },
              h('span', { className: 'mrun-elide', title: mlx?.path ?? '' }, shortName(mlx?.path ?? '') || '.mlx'),
              h('span', { className: 'mrun-spacer' }),
              h('span', { className: 'mrun-hint' }, t('mlxReadOnly')),
              h('button', {
                type: 'button',
                className: 'mrun-btn',
                'data-mrun-mlx-close': true,
                onClick: () => setView('editor')
              }, t('close'))),
            h('div', { className: 'mrun-mlx-body' },
              (mlx?.sections ?? []).map((section, index) => mlxSection(section, index, images, t)))))
      }

      if (view === 'settings') {
        const probeMissing = probe !== undefined && probe.matlabPresent === false
        const section = (titleKey, children) => h('div', { className: 'mrun-section' },
          h('div', { className: 'mrun-section-head' }, t(titleKey)),
          h('div', { className: 'mrun-grid' }, children))
        return h('div', { className: 'mrun-root', 'data-mrun-root': true },
          toolbar,
          noticeLine,
          probeMissing ? h('div', { className: 'mrun-note' }, t('missing')) : null,
          h('div', { className: 'mrun-settings', 'data-mrun-settings': true },
            section('runMode', [
              field('mode', 'mode', 'select'),
              field('warmFigures', 'warmFigures', 'checkbox'),
              field('autoSave', 'autoSave', 'checkbox')
            ]),
            section('workspace', [
              field('autoDetect', 'autoDetect', 'checkbox'),
              h('div', { className: 'mrun-row-check', 'data-mrun-detected': true },
                h('span', { className: 'mrun-hint' },
                  `${t('detectedWorkspace')}: ${probe?.detected?.cwd ?? '—'}（${t(detectKey(probe?.detected?.source))}）`)),
              field('workdir', 'workdir'),
              field('scriptDir', 'scriptDir'),
              h('div', { className: 'mrun-row-check' },
                h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-follow-workspace': true, onClick: () => void followWorkspace() }, t('useCurrentWorkspace')),
                h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-pin-workspace': true, onClick: () => void pinWorkspace() }, t('pinWorkspace')))
            ]),
            section('matlabRuntime', [
              field('matlabPath', 'matlabPath'),
              field('timeout', 'timeoutMs'),
              h('div', { className: 'mrun-row-check' },
                h('span', { className: 'mrun-path-line mrun-elide', title: probe?.configPath ?? '' },
                  `${t('configPath')}: ${probe?.configPath ?? '—'}`)),
              h('div', { className: 'mrun-row-check' },
                h('span', { className: 'mrun-hint' },
                  `${t('session')}: ${sessionLive ? `${t('sessionRunning')} (pid ${probe?.session?.pid ?? '?'})` : t('sessionIdle')}`)),
              h('div', { className: 'mrun-row-check' },
                h('span', { className: 'mrun-hint' }, probe?.workdirPresent === false ? `${t('workdir')}: ${probe.workdir}` : ''))
            ]),
            section('saveInfo', [
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line', 'data-mrun-help': 'file' }, t('saveInfoFile'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('saveInfoDraft'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('saveInfoBuffer')))
            ]),
            section('helpInfo', [
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpRun'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpStop'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpSave'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpPicker'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpNew'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpTree'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpVars'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpSplit'))),
              h('div', { className: 'mrun-row-check' }, h('span', { className: 'mrun-help-line' }, t('helpSession')))
            ]),
            h('div', { className: 'mrun-actions' },
              h('button', { type: 'button', className: 'mrun-btn', 'data-primary': 'true', disabled: saving, onClick: () => void saveConfig() }, t('saveConfig')),
              h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-restart-session': true, onClick: () => void restartSession() }, t('restartSession')))))
      }

      const rows = []
      const walk = (entries, depth) => {
        for (const entry of entries) {
          rows.push(h(TreeRow, {
            key: entry.path,
            entry,
            depth,
            active: entry.path === bufferKey,
            expanded: expanded[entry.path] !== undefined,
            onToggle: (target) => void toggleDir(target),
            onOpen: (target) => openTreeEntry(target)
          }))
          const children = expanded[entry.path]
          if (children !== undefined) walk(children, depth + 1)
        }
      }
      if (tree !== undefined) walk(tree.entries ?? [], 0)

      const activeRoot = (roots?.roots ?? []).find((root) => tree?.path === root.path || String(tree?.path ?? '').startsWith(`${root.path}/`))
      const rootPath = activeRoot?.path ?? roots?.roots?.[0]?.path ?? ''

      const treePanel = showTree
        ? h('div', { className: 'mrun-side', 'data-mrun-side': true, ref: sideRef, style: { width: `${treeWidth}px` } },
          h('div', { className: 'mrun-tree', 'data-mrun-tree': true },
          h('div', { className: 'mrun-tree-head' },
            h('button', {
              type: 'button',
              className: 'mrun-btn',
              disabled: tree?.parent === null || tree?.parent === undefined,
              title: t('up'),
              onClick: () => void loadTree(tree?.parent)
            }, '↑'),
            h('span', { className: 'mrun-roots-wrap' }, h('select', {
              className: 'mrun-select mrun-roots',
              'data-mrun-roots': true,
              title: t('roots'),
              value: rootPath,
              onChange: (event) => void loadTree(event.currentTarget.value)
            }, (roots?.roots ?? []).map((root) => h('option', { key: root.path, value: root.path, title: root.path },
              root.kind === 'extra' ? `+ ${root.name}` : root.name)))),
            h('button', {
              type: 'button',
              className: 'mrun-btn',
              'data-mrun-add-root': true,
              title: t('addRoot'),
              onClick: () => {
                setAddingRoot(!addingRoot)
                setRootInput('')
              }
            }, '+'),
            h('button', { type: 'button', className: 'mrun-btn', title: t('refresh'), onClick: () => void loadTree(tree?.path) }, '⟳')),
          addingRoot
            ? h('div', { className: 'mrun-add-root', 'data-mrun-add-root-row': true },
              h('input', {
                value: rootInput,
                placeholder: t('addRootHint'),
                onChange: (event) => setRootInput(event.currentTarget.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') void addRoot(rootInput)
                }
              }),
              h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-add-root-ok': true, onClick: () => void addRoot(rootInput) }, t('addRootOk')),
              h('button', { type: 'button', className: 'mrun-btn', onClick: () => setAddingRoot(false) }, t('cancel')),
              activeRoot?.kind === 'extra'
                ? h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-remove-root': true, onClick: () => void removeRoot(rootPath) }, t('removeRoot'))
                : null)
            : null,
          h('div', { className: 'mrun-tree-list' }, rows)),
          showVars ? h('div', {
            className: 'mrun-hsplit',
            'data-mrun-hsplit': true,
            title: '⇕',
            onMouseDown: beginVarsDrag
          }) : null,
          showVars ? h('div', { className: 'mrun-side-vars', 'data-mrun-side-vars': true, style: { height: `${varsHeight}px` } },
            varsView({ vars, t, onRefresh: () => void refreshVars(true), sessionLive, onOpen: (target) => void openVariable(target) })) : null)
        : showVars
          ? h('div', { className: 'mrun-side', 'data-mrun-side': true, ref: sideRef },
            h('div', { className: 'mrun-side-vars', 'data-mrun-side-vars': true, style: { flex: '1 1 auto', height: 'auto' } },
              varsView({ vars, t, onRefresh: () => void refreshVars(true), sessionLive, onOpen: (target) => void openVariable(target) })))
          : null

      const consolePane = h('div', {
        className: 'mrun-console',
        style: consoleHeight > 0 ? { flex: '0 0 auto', height: `${consoleHeight}px` } : undefined
      },
      h('div', { className: 'mrun-console-head', 'data-mrun-console-head': true },
        h('span', null, t('output')),
        h('span', { className: 'mrun-spacer' })),
      consoleView({ snapshot, outputRef, figures: true, t }))

      const folderPath = tree?.path ?? probe?.detected?.cwd ?? probe?.config?.workdir ?? ''
      const parts = String(folderPath).split('/').filter(Boolean)
      const editingLabel = typeof bufferKey === 'string' && bufferKey.startsWith('draft:')
        ? `draft:${name || 'untitled'}`
        : shortName(bufferKey ?? '') || (name || 'untitled')
      const crumb = h('div', { className: 'mrun-crumb', 'data-mrun-crumb': true, title: folderPath },
        h('span', null, '⌸'),
        h('span', { className: 'mrun-crumb-seg', 'data-mrun-crumb-root': true, onClick: () => void loadTree('/') }, '/'),
        parts.map((part, index) => h('span', { key: `${index}:${part}` },
          h('span', { className: 'mrun-crumb-sep' }, '›'),
          h('span', {
            className: 'mrun-crumb-seg',
            'data-active': String(index === parts.length - 1),
            title: `/${parts.slice(0, index + 1).join('/')}`,
            onClick: () => void loadTree(`/${parts.slice(0, index + 1).join('/')}`)
          }, part))),
        h('span', { className: 'mrun-spacer' }),
        h('span', { className: 'mrun-crumb-seg', 'data-mrun-target': true, title: '当前编辑目标 / edit target' }, `✎ ${editingLabel}`))

      const variableModal = varEditor === undefined
        ? null
        : h('div', {
          className: 'mrun-modal',
          'data-mrun-var-modal': true,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) setVarEditor(undefined)
          }
        },
        h('div', { className: 'mrun-modal-box' },
          h('div', { className: 'mrun-modal-head' },
            h('span', { className: 'mrun-modal-title' }, varEditor.name),
            h('span', { className: 'mrun-hint' }, `${varEditor.cls} ${(varEditor.size ?? []).join('×')}`),
            h('span', { className: 'mrun-spacer' }),
            h('button', { type: 'button', className: 'mrun-btn', 'data-mrun-var-close': true, onClick: () => setVarEditor(undefined) }, '✕')),
          h('div', { className: 'mrun-modal-body' },
            h('textarea', {
              'data-mrun-var-text': true,
              value: varText,
              spellCheck: false,
              onChange: (event) => setVarText(event.currentTarget.value)
            })),
          h('div', { className: 'mrun-modal-foot' },
            h('span', { className: 'mrun-hint' }, t('varHint')),
            h('button', { type: 'button', className: 'mrun-btn', 'data-primary': 'true', 'data-mrun-var-save': true, disabled: varSaving, onClick: () => void saveVariable() }, t('varSave')),
            h('button', { type: 'button', className: 'mrun-btn', onClick: () => setVarEditor(undefined) }, t('varCancel')))))

      return h('div', { className: 'mrun-root', 'data-mrun-root': true },
        toolbar,
        crumb,
        noticeLine,
        h('div', { className: 'mrun-body', ref: bodyRef },
          treePanel,
          showTree
            ? h('div', {
              className: 'mrun-vsplit',
              'data-mrun-vsplit': true,
              title: '⇔',
              onMouseDown: beginTreeDrag
            })
            : null,
          h('div', { className: 'mrun-pane', ref: paneRef },
            h('div', { className: 'mrun-editor' },
              h('div', { className: 'mrun-gutter', ref: gutterRef, 'aria-hidden': true },
                Array.from({ length: code.split('\n').length }, (_, index) => String(index + 1)).join('\n')),
              h('div', { className: 'mrun-code-wrap', 'data-mrun-code-wrap': true },
              highlightLayer(code, highlightRef),
              h('textarea', {
                ref: codeRef,
                className: 'mrun-code',
                'data-mrun-code': true,
                'data-mrun-editor': true,
                value: code,
                spellCheck: false,
                autoCapitalize: 'off',
                autoCorrect: 'off',
                wrap: 'off',
                onChange: (event) => setCode(event.currentTarget.value),
                onKeyDown,
                onScroll: syncScroll
              }))),
            h('div', {
              className: 'mrun-split',
              'data-mrun-split': true,
              title: '⋮',
              onMouseDown: beginDrag
            }),
            consolePane)),
        variableModal)

      function field(labelKey, key, kind) {
        const value = draft?.[key] ?? ''
        if (kind === 'checkbox') {
          return h('label', { className: 'mrun-row-check' },
            h('input', {
              type: 'checkbox',
              'data-mrun-config': key,
              checked: draft?.[key] === true,
              onChange: (event) => setDraft({ ...(draft ?? {}), [key]: event.currentTarget.checked })
            }),
            h('span', null, t(labelKey)))
        }
        if (kind === 'select') {
          return h('div', { className: 'mrun-row' },
            h('span', { className: 'mrun-row-label' }, t(labelKey)),
            h('div', { className: 'mrun-row-control' },
              h('select', {
                'data-mrun-config': key,
                value,
                onChange: (event) => setDraft({ ...(draft ?? {}), [key]: event.currentTarget.value })
              },
              h('option', { value: 'session' }, t('modeSession')),
              h('option', { value: 'batch' }, t('modeBatch')))))
        }
        return h('div', { className: 'mrun-row' },
          h('span', { className: 'mrun-row-label' }, t(labelKey)),
          h('div', { className: 'mrun-row-control' },
            h('input', {
              'data-mrun-config': key,
              value: value === '' ? '' : String(value),
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
              onChange: (event) => {
                const next = key === 'timeoutMs'
                  ? Number(event.currentTarget.value) || 0
                  : event.currentTarget.value
                setDraft({ ...(draft ?? {}), [key]: next })
              }
            })))
      }

    }

    /** The tab chip's text. */
    function Title(props) {
      return h(react.Fragment, null,
        h('span', { 'aria-hidden': true, style: { opacity: 0.8, marginRight: '4px' } }, '▤'),
        typeof props?.useTabInfo === 'function' ? null : null,
        'MATLAB')
    }

    /** Required browser services. */
    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']

    /** Client plugin body. */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-matlab-runner: dictionaries')
      ctx.effect(() => ctx.sidebarRightTabs.register(definition(t)), 'dsh-matlab-runner: tab type')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ID,
        locale: NS
      }, Body)), 'dsh-matlab-runner: tab body')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: ID
      }, Title)), 'dsh-matlab-runner: tab title')
      ctx.inject(['shortcuts'], (ctx) => {
        ctx.effect(() => ctx.shortcuts.register({
          id: 'matlab.runner.open',
          label: () => t('shortcut'),
          aliases: ['matlab runner', 'run matlab'],
          defaults: {
            'desktop:macos': { code: 'KeyM', modifiers: ['primary', 'shift'] },
            'desktop:windows': { code: 'KeyM', modifiers: ['primary', 'shift'] },
            'desktop:linux': { code: 'KeyM', modifiers: ['primary', 'shift'] },
            'web:macos': { code: 'KeyM', modifiers: ['primary', 'shift', 'alt'] },
            'web:windows': { code: 'KeyM', modifiers: ['primary', 'shift', 'alt'] }
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: () => {
            try {
              ctx.sidebarRight.openTab(KIND)
            } catch {
              return { status: 'blocked', reason: t('guide.description') }
            }
            return { status: 'handled', run: () => {} }
          }
        }), 'dsh-matlab-runner: shortcut')
      })
    }

    exports.apply = apply
    exports.inject = inject
    // Test hook: the highlighter is pure, so tests can pin its token split.
    exports.__test = { tokenizeLine, mlxSection, setActiveCwd, withWorkspace, activeCwd: () => activeCwd }
    return module.exports
  }
})
