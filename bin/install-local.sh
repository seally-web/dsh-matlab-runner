#!/bin/sh
# Install (or re-install) dsh-matlab-runner into a DSH profile by hand.
#
# The official desktop app owns its profile: `dsh plugin --profile desktop add`
# refuses with "managed exclusively by the Electron application", so this script
# does the two things that command would have done — place the package in the
# profile's node_modules and list it in the profile manifest — and then asks you
# to restart the app so the loader composes the new bundle layer.
#
#   ./bin/install-local.sh              # default profile: $DSH_HOME/profiles/desktop
#   DSH_PROFILE_DIR=/path/to/profile ./bin/install-local.sh
set -eu

SRC=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DSH_HOME_DIR=${DSH_HOME:-"$HOME/.dsh"}
PROFILE=${DSH_PROFILE_DIR:-"$DSH_HOME_DIR/profiles/desktop"}

if [ ! -f "$PROFILE/package.json" ]; then
  echo "no DSH profile at $PROFILE" >&2
  exit 1
fi

DEST="$PROFILE/node_modules/dsh-matlab-runner"
mkdir -p "$DEST"
# Copy the payload only; a symlink would escape the profile and the plugin
# server refuses to serve client bundles from outside it.
rsync -a --delete "$SRC/lib/" "$DEST/lib/"
cp "$SRC/package.json" "$SRC/cordis.patch.yml" "$SRC/README.md" "$DEST/"
echo "installed payload -> $DEST"

DSH_MATLAB_PLUGIN_SRC="$SRC" node - "$PROFILE/package.json" <<'JS'
const fs = require('node:fs')
const path = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'))
manifest.dependencies = manifest.dependencies ?? {}
// A link: spec that points at the workspace source (never at the copy inside
// node_modules — pnpm would resolve that to itself). The copy above keeps the
// running app supplied even if a later pnpm install has not linked the source.
manifest.dependencies['dsh-matlab-runner'] = 'link:' + process.env.DSH_MATLAB_PLUGIN_SRC
const profile = (manifest.dsh = manifest.dsh ?? {})
profile.profile = profile.profile ?? {}
const bundles = (profile.profile.bundles = profile.profile.bundles ?? [])
if (!bundles.includes('dsh-matlab-runner')) bundles.push('dsh-matlab-runner')
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
console.log('profile manifest: dependency + bundle row ready')
JS

# Seed the preset config so the panel opens with paths already filled in.
CONFIG="$DSH_HOME_DIR/matlab-runner.json"
if [ ! -f "$CONFIG" ]; then
  WORKSPACE=${DSH_MATLAB_WORKDIR:-"$HOME/Documents/deepseek-harness/default-workspace"}
  cat > "$CONFIG" <<JSON
{
  "mode": "session",
  "warmFigures": false,
  "matlabPath": "/Applications/MATLAB_R2026a.app/bin/matlab",
  "sessionArgs": ["-nodesktop", "-nosplash"],
  "extraArgs": ["-nodisplay", "-nosplash"],
  "workdir": "$WORKSPACE",
  "scriptDir": "$WORKSPACE/matlab",
  "timeoutMs": 600000,
  "env": {}
}
JSON
  echo "config -> $CONFIG"
else
  echo "config kept -> $CONFIG"
fi

echo
echo "Reloading the host (the app watches the profile manifest, so this needs no"
echo "restart):"
sh "$(dirname "$0")/reload-host.sh" "$PROFILE" || true
echo
echo "Then reload the page (Cmd/Ctrl+R) so the browser half updates, and open the"
echo "right sidebar -> add control -> the MATLAB runner card. Restart the app only"
echo "if the tab still shows the old panel. Verify the host half with:"
echo "  DSH_GUI_URL=<the URL the app printed> node plugins/dsh-matlab-runner/bin/check.mjs"
