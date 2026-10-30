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
