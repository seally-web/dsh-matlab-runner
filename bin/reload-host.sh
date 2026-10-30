#!/bin/sh
# Re-compose the plugin's Loader entry without quitting the app.
#
# The desktop app watches the profile manifest: dropping the bundle row unloads
# the plugin, putting it back loads it again from disk. That is enough to pick up
# new host-half code (the host is otherwise only composed at boot).
set -eu
PROFILE="${1:-$HOME/.dsh/profiles/desktop}"
MANIFEST="$PROFILE/package.json"
[ -f "$MANIFEST" ] || { echo "no profile manifest at $MANIFEST" >&2; exit 1; }

cp "$MANIFEST" /tmp/profile-package.before-reload.json
node - "$MANIFEST" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const original = fs.readFileSync(file, 'utf8')
const manifest = JSON.parse(original)
const bundles = manifest?.dsh?.profile?.bundles
if (!Array.isArray(bundles) || !bundles.includes('dsh-matlab-runner')) {
  console.error('dsh-matlab-runner is not in dsh.profile.bundles — run install-local.sh first')
  process.exit(1)
}
const without = { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh.profile, bundles: bundles.filter((name) => name !== 'dsh-matlab-runner') } } }
fs.writeFileSync(file, JSON.stringify(without, null, 2) + '\n')
NODE

sleep 3
cp /tmp/profile-package.before-reload.json "$MANIFEST"
sleep 3
echo "reloaded: $MANIFEST (host half re-composed)"
