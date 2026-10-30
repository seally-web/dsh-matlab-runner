# dsh-matlab-runner 推广文案

> 事实基线：v0.2.2 · MIT · `npm i dsh-matlab-runner` · github.com/seally-web/dsh-matlab-runner
> 实测环境：macOS 14 / MATLAB R2026a Update 2（26.1.0.3251617）/ DeepSeek Harness 0.2.x

---

## 0. 一句话

**把 MATLAB 装进 AI 的侧边栏：写、跑、看图，不用切窗口。**

其他版本：

- AI 写 MATLAB，当场就跑——图真的会弹出来。
- 你的 AI 助手会写 MATLAB 了，但它没有手。现在有了。
- 侧栏里一个常驻 MATLAB：12 毫秒跑一次脚本，`figure` 直接弹窗。
- 不是 MCP 工具桥，是 IDE：编辑器、终端式输出、变量表、`.mlx` 预览，全在侧边栏。

---

## 1. 主文案（公众号 / 知乎 / 掘金，约 900 字）

### 让 AI 写 MATLAB，然后当场跑起来

用 AI 写 MATLAB 的人，大概都经历这三步：

1. 它写了一段挺好的代码；
2. 你复制到 MATLAB 里；
3. 报错、改、再复制、再跑。碰上 `figure` 还得自己盯窗口。

问题不在模型，在**回路太长**。MATLAB 的授权模型决定了它必须在本机跑，而 AI 跑在一个对话框里——中间隔着人。

`dsh-matlab-runner` 做的事很简单：**把 MATLAB 的图形界面搬进 AI 的侧边栏，再把这个侧栏交给 AI 用。**

左侧文件树（可挂多个文件夹），中间是带语法高亮的编辑器，下面是输出和图；右侧同栏是**真实的 MATLAB 工作区变量**——不是日志摘录，是 `whos` 的真值，双击就能看内容、改数值。编辑器与输出之间、文件树与编辑区之间都能拖。

**关键差别是「快」。**

大多数 MATLAB 桥接方案每次调用起一个 `matlab -batch`，冷启动十几二十秒。这个插件默认跑一个**常驻 MATLAB 会话**（`-nodesktop`）：

| 操作 | 耗时 |
|---|---|
| 首次启动（一次性） | 6–9 秒 |
| 之后每次运行 | **12–84 毫秒** |
| 首个 `figure`（Java/图形栈初始化） | ≈13 秒，可用 `warmFigures` 挪到启动期 |

而且这个会话是「有桌面」的：`figure`、Scope、Simulink 编辑器**会真的在你的屏幕上弹出来**，同时导出的 PNG 会以缩略图出现在面板里，点开就是大图。

**给 AI 的那一半：`matlab_run`。**

装上插件后，agent 多了一个工具。它可以直接跑代码，也可以打开你正在编辑的那个 `.m`，在脚本**自己所在目录**里跑（所以 `readmatrix('data.xlsx')` 这种相对路径能对上——这是很多方案会踩的坑）。想让它调 Simulink？

> 「载入 `model.slx`，把 Gain 改成 2.5，跑 10 秒仿真，把 Scope 波形导出来给我看。」

它会 `load_system` → `set_param` → `sim` → `exportgraphics`，图直接出现在面板里。

**为什么不是 MCP？**

市场里已有三个 MATLAB 相关插件，都是「让 agent 调用 MATLAB」的工具桥，没有一个提供侧栏编辑器、常驻会话、图形弹窗和变量面板。MCP 适合让 AI 调一个黑盒；而写 MATLAB 时你需要的是**看着它跑**。

所以这个插件选了另一条路：**先做一个给人用的 IDE，再把同一个 IDE 交给 AI。**

**其它顺手的东西**

- **换文件夹不用改配置**：自动跟随当前会话工作区；脚本保存目录、数据目录一起跟着走，路径错了会告诉你「当前工作区是 X」。
- **保存语义清楚**：打开的是真实文件 → 保存/自动保存**直接覆盖原文件**；未命名草稿 → 另存到脚本目录；未保存内容存在浏览器 localStorage，刷新不丢。
- **外部改动自动同步**：AI 在对话框里改了文件，面板 3 秒内跟上；你有没保存的编辑就不覆盖。
- **`.mlx` 能看**：实时脚本以只读形式渲染（文本、代码、输出、图），138 个真实 `.mlx` 解析全部通过。
- **多文件夹**：像 MATLAB 的「添加到路径」，额外挂载的目录可读可编辑，但运行目录仍跟随工作区。

**装法**

```sh
dsh plugin --profile web add dsh-matlab-runner
```

或者在 DSH 插件市场搜索 `matlab`。需要本机装 MATLAB（R2026a 实测，更早版本大概率可用）。

**它不做什么**：不替代 MATLAB 本体；`.slx`/`.mdl` 是二进制，面板不会去编辑它们（该在 Simulink 里改就用 `open_system`）；Windows 还没实测过。

MIT 协议，代码都在 [GitHub](https://github.com/seally-web/dsh-matlab-runner)。如果你也被「复制粘贴回 MATLAB」折磨过，装上试试——它最爽的一刻，是你对 AI 说「跑一下」，然后看见图自己弹出来。

---

## 2. 短文案

### A. 微博 / X（≤140 字）

> 给 AI 装上了 MATLAB 的手：侧栏里一个常驻 MATLAB 会话，每次跑脚本 12–84ms，`figure` 真的弹窗；变量表是真 `whos`，双击能改；AI 还能直接 `matlab_run` 跑你的 `.m`。
> 不用再复制粘贴回 MATLAB 了。
> `dsh plugin --profile web add dsh-matlab-runner`（MIT）

### B. 即刻 / 朋友圈（更口语）

> 折腾了两天，把 MATLAB 塞进了 AI 的侧边栏。
>
> 以前：AI 写代码 → 我复制 → MATLAB 里跑 → 报错 → 复制回去。
> 现在：AI 写着写着，「跑一下」——图就弹出来了。冷启动一次 8 秒，之后每次 15 毫秒。
>
> 变量表是真的：`whos` 里有什么，侧栏就有什么，双击还能改值。
> 顺便让它开 Simulink 也算跑通了。
>
> 开源了，MIT：`dsh plugin --profile web add dsh-matlab-runner`

### C. GitHub Release / 市场简介（1 句 + 3 点）

> **MATLAB in your AI sidebar** — a VS Code-like `.m` editor with a persistent MATLAB session.
>
> - Warm session: 12–84 ms per run, figures really open on your desktop.
> - Live workspace variables (real `whos` values, double-click to edit), `.mlx` preview, extra folder mounts.
> - An agent-facing `matlab_run` tool, so the AI can run the script you are editing — in that script's own folder.

---

## 3. 技术社区版

### V2EX / 少数派 标题候选

- 把 MATLAB 做成 AI 侧边栏里的 IDE：常驻会话、12ms 跑一次、figure 弹窗
- 写了个 DSH 插件：让 AI 直接跑 MATLAB 脚本，别再复制粘贴了
- MATLAB × AI 的正确姿势：不是 MCP，是给它一个侧栏 IDE

### V2EX 正文骨架

```
TL;DR：DSH 插件，给侧栏加一个常驻 MATLAB 会话 + 编辑器 + 变量表 + matlab_run 工具。MIT。

背景：用 AI 写 MATLAB 最大的摩擦是回路长——生成、复制、粘贴、跑、报错、复制回去。
MATLAB 必须本地跑，而 AI 在对话框里，中间隔着人。

做法：
1) 常驻会话（spawn `matlab -nodesktop`，marker 切分输出），不是每次 -batch。
   冷启动 6–9s，之后单次 12–84ms；-nodesktop 下 figure 窗口真的弹出。
2) 侧栏 UI：文件树（多文件夹挂载）/ 语法高亮编辑器 / 输出 / 真 whos 变量表（双击改值）/ .mlx 只读渲染。
3) agent 工具 matlab_run：在脚本自己所在目录跑，相对路径能对上数据文件。
4) 3s 轮询 mtime，外部改动自动回灌面板（不覆盖未保存编辑）。

踩过的坑，给后来人：
- macOS 下 MATLAB 启动器会 daemon 化子进程，只 kill 直接子进程会留孤儿 —— 要杀进程组。
- 脚本名不能叫 plot.m / mean.m，run 会先解析到脚本。
- `run` 会切 MATLAB 当前目录到脚本目录，pwd 相对导出的图会落在别处。
- MATLAB 拒绝以下划线开头的脚本名（`_vars.m` → "文本字符无效"）。
- 首个 figure 要 13s（Java/图形栈），可用 warmFigures 预先初始化。

同类：市场上三个 MATLAB 插件都是 MCP 工具桥，没有侧栏 IDE；如果你只想让 agent 调 MATLAB，装 matlab-mcp 更轻。

repo: github.com/seally-web/dsh-matlab-runner
```

### Hacker News（英文，可选）

```
Show HN: A MATLAB IDE inside an AI chat sidebar (persistent session, 12ms/run)

Most MATLAB-for-LLM bridges shell out to `matlab -batch` per call: 15–20s cold start,
no figures, no workspace state.

This is a DSH plugin instead: one persistent `matlab -nodesktop` session driven over
stdio with a marker protocol. Boot 6–9s once, then 12–84ms per run — and because the
session keeps its desktop stack, `figure` windows actually open. The sidebar panel
gives you a file tree, a syntax-highlighted editor, the real `whos` table (double-click
to edit a value), and read-only `.mlx` rendering. The agent gets a `matlab_run` tool that
runs a script in its own folder, so relative data paths work.

MIT, macOS/MATLAB R2026a tested.
```

---

## 4. 配图与发布清单

**配图（已在仓库 `docs/`）**

| 图 | 用途 |
|---|---|
| `docs/panel.png` | 主图：编辑器 + 文件树 + 变量表 + 输出 |
| `docs/settings.png` | 设置页（模式/自动保存/工作区/路径） |
| `docs/narrow.png` | 窄栏形态（说明可拖拽收缩） |

**发布渠道与顺序**

1. GitHub Release `v0.2.2`（已发）——文案用 §2-C；标题写清 "MATLAB in the sidebar"
2. npm 包页 README 顶部（已有三个 badge，可加一句 §0 的一句话）
3. DSH 插件市场（topic `dsh-plugin` + keyword 已配置，等自动抓取）
4. 技术社区（V2EX / 掘金 / Reddit r/matlab）——用 §3，先发 V2EX 收反馈
5. 短渠道（微博/X/即刻）——用 §2-A / §2-B

**口径红线（避免被杠）**

- 说「常驻会话 12–84ms」时补一句「首次启动 6–9s」；说 figure 弹窗时注明「`session` 模式」。
- 不要承诺 Windows 可用（未实测）；不要说「替代 MATLAB」。
- `.mlx` 只说「只读预览」，不说「可编辑」。
