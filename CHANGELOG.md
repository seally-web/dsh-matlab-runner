# Changelog

## Unreleased

## 0.2.4

(npm could not publish 0.2.3 — it stayed in a staged state that the registry lists as empty; 0.2.4 carries the same fix.)

## 0.2.3

### Fixed
- Host half no longer imports `@deepseek-ai/dsh-tools`. On dsh 0.2.2 that
  package is not resolvable from a profile install, so the host module failed to
  import and the whole plugin silently disappeared (no sidebar tab, no
  `/matlab/api/*` routes, no `matlab_run` tool). The tool definition is a plain
  object now — which is all the tools service registers.

## 0.2.2 — 2026-10-30

- Refresh loop no longer overwrites unsaved work: a buffer restored from
  localStorage is compared against the text **on disk**, not against itself.
- Manual Save (⌘S / 保存) now moves the change baseline too, so a save followed
  by an outside edit still reloads correctly.

## 0.2.1 — 2026-10-30

- **External edits flow back into the panel.** The script picker and file tree
  refresh every few seconds, and an open file reloads automatically when it
  changed on disk (agent editing it in chat, `git checkout`, MATLAB writing
  results) — as long as the buffer itself has no unsaved edits.
- Fixed autosave writing the textarea DOM node instead of the buffer text.
- Docs: config sample uses portable placeholder paths.

## 0.2.0 — 2026-10-30

- **Multiple folders**: the tree header has a folder picker plus `＋` to mount any
  absolute path (`~` supported) as an extra root, like MATLAB's add-to-path list.
  Mounts persist in `matlab-runner.json` (`extraRoots`) and can be removed from
  the same row.
- **Variable editor**: double-click a row in the workspace panel to read the
  variable and assign a new literal back with `evalin('base', ...)`.
- **VS Code-style layout**: grouped toolbar, settings as labelled sections,
  variables merged under the tree with its own splitter, breadcrumb with the
  current folder, console header + status bar, remembered panel toggles.
- Sidebar header now shrinks with the panel instead of overflowing.
- Values column in the variables panel (`mat2str` / `evalc('disp')`).
- Tests: `host-apply` covers the variable routes and folder mounts.

## 0.1.0 — 2026-10-30

- First working plugin: `matlab_run` agent tool, right-sidebar page tab with
  editor, gutter and syntax highlighting, persistent MATLAB session (figures
  open), `batch` fallback, run/stop/save, streaming console, figure thumbnails,
  `.mlx` read-only preview, autosave, workspace auto-detection and path errors
  that name the current workspace.
