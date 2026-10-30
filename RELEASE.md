# Releasing

## One-time setup

```sh
npm login --registry https://registry.npmjs.org
npm whoami --registry https://registry.npmjs.org   # → seally-web
```

> This machine's `~/.npmrc` sets `registry=https://registry.npmmirror.com`, which
> is a read-only mirror — publishing must target the public registry.
> `package.json` already pins `publishConfig.registry`, so a plain `npm publish`
> goes to the right place.

Git remotes:

```sh
git remote add origin git@github.com:seally-web/dsh-matlab-runner.git   # once
```

## Every release

```sh
npm test                     # 5 fast suites
npm version patch|minor      # bumps package.json + commits + tags
git push && git push --tags
npm publish                  # prepublishOnly runs the tests again
```

Then create the GitHub release from the tag; the CHANGELOG section is the body.

## Getting into the plugin catalogue

`awesome-dsh-plugin.com` (the list dshmarket reads) indexes GitHub repositories
that look like DSH plugins:

1. Repo topics: `dsh-plugin` (required), plus `matlab`, `deepseek-harness`.
2. `package.json` keywords contain `dsh-plugin` (already true).
3. Publish to npm so the entry gets a version and download counts.

The site refreshes daily; until then people can install with
`dsh plugin --profile web add dsh-matlab-runner`.

## Packaging a tarball for a manual install

```sh
npm pack --pack-destination dist
# → dist/dsh-matlab-runner-<version>.tgz
```

## If a release is broken

```sh
npm deprecate dsh-matlab-runner@0.2.1 "use 0.2.0, panels fail to boot"
npm version patch && npm publish
```

## Publishing with 2FA / staged publishing

npm accounts with 2FA cannot publish with a plain login token. Use a
**Granular Access Token** with *Read and write* and *Bypass two-factor
authentication* (https://www.npmjs.com/settings/seally-web/tokens).

npm may route the first publish of a brand-new name through its
**staged publishing** flow: the registry creates a public placeholder version
`0.0.0-stage` ("Temporary package placeholder for staged publishing") and the
real version becomes installable a few minutes later. Do **not** assume failure
from an immediate `npm view` 404 — check
`https://registry.npmjs.org/<name>` instead. If the version is genuinely waiting
for approval, run:

```sh
npm stage list                         # needs npm >= 11.15
npm stage approve <stage-id>           # prompts for a 2FA code
```

`dsh-matlab-runner@0.2.0` went live this way on 2026-10-30 (placeholder
`0.0.0-stage` stays in the version list; `latest` points at the real version).
