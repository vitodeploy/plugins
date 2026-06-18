# VitoDeploy Plugins

The official marketplace monorepo for [VitoDeploy](https://vitodeploy.com)
plugins. Every official plugin lives here, and anyone can **fork → add a plugin
→ open a PR** to get it listed.

Each merged plugin is validated, deterministically zipped, hashed, and signed,
then published as a [GitHub Release](https://github.com/vitodeploy/plugins/releases).
The repo also publishes a **catalog** (`catalog/index.json`) that the VitoDeploy
app reads to render the marketplace. There is no separate backend — **GitHub is
the marketplace API**.

## Official plugins

| Plugin | Package | Categories | Home page |
| ------ | ------- | ---------- | --------- |
| **Laravel Reverb** | `vitodeploy/laravel-reverb-plugin` | laravel, websockets | [docs](https://vitodeploy.com/docs/plugins/laravel-reverb) |
| **Laravel Octane** | `vitodeploy/laravel-octane-plugin` | laravel, performance | [docs](https://vitodeploy.com/docs/plugins/laravel-octane) |
| **Tiny File Manager** | `vitodeploy/tiny-file-manager-plugin` | files, utilities | [docs](https://vitodeploy.com/docs/plugins/tiny-file-manager) |

## Browse plugins

The VitoDeploy app's marketplace UI fetches the catalog and shows each plugin's
name, description, icon, categories, and a **Home page** link. To browse here:

- Look under [`plugins/`](plugins/) — one directory per plugin.
- Read [`catalog/index.json`](catalog/index.json) for the generated listing.
- Download a signed zip and its assets from the
  [Releases](https://github.com/vitodeploy/plugins/releases) page (tag
  `<slug>-v<version>`).

## How the catalog works

On every push to `main`, CI packs each **changed** plugin into a deterministic
zip (stable bytes → stable SHA-256), signs the zip and a metadata document with
the VitoDeploy release key (minisign / Ed25519), and creates a GitHub Release
tagged `<slug>-v<version>` carrying the zip, signatures, and listing assets.
It then regenerates `catalog/index.json` and publishes it (committed to `main`
and attached to a `catalog` release for a stable, CDN-backed URL).

Each catalog entry carries the plugin's identity (name, version, namespace),
listing metadata (display name, description, icon, screenshots, categories,
home page), and an `artifact` block (zip URL + SHA-256, signature URLs, and the
signed metadata URL). See [`DESIGN.md`](DESIGN.md) for the full shape and the
integrity model.

> The published catalog is **discovery/display** in v1. Enforced signed-install
> in the app is a fast-follow. See [`SECURITY.md`](SECURITY.md).

## Contributing

Want to publish a plugin? Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full
fork → scaffold → validate → PR flow. The copyable starter is in
[`examples/hello-world`](examples/hello-world).

> **Don't full-clone.** This repo holds every published plugin and grows large
> over time. Use a partial + sparse checkout so you only download your own
> plugin and the tooling:
>
> ```bash
> git clone --filter=blob:none --sparse https://github.com/vitodeploy/plugins
> cd plugins
> git sparse-checkout set plugins/my-plugin scripts schema examples
> ```

## Repository layout

```
plugins/        # one directory per plugin (composer.json + PHP source + assets)
examples/       # hello-world starter plugin to copy
schema/         # manifest.schema.json — the composer.json + extra.vito schema
scripts/        # validate / pack / catalog / publish tooling (Node ≥ 20)
catalog/        # index.json — the generated catalog the app reads
.github/        # CI workflows, issue/PR templates, CODEOWNERS
DESIGN.md       # the authoritative design for the marketplace
minisign.pub    # signing public key, pinned in the VitoDeploy app
```

## Local tooling

The tooling needs **Node ≥ 20**:

```bash
npm install
node scripts/validate.mjs [slug]        # validate one plugin (or all)
node scripts/pack.mjs --dry-run [slug]  # prove the zip is deterministic + see its sha256
```

Authoring a plugin needs **PHP 8.4** and familiarity with Vito's
`App\Plugins\AbstractPlugin` and the `Register*` builders. See
<https://vitodeploy.com/docs/plugins> and the existing plugins in
[`plugins/`](plugins/).

## License

[AGPL-3.0](LICENSE), matching the VitoDeploy app.
