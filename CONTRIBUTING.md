# Contributing a plugin

This repo is the publishing pipeline for VitoDeploy plugins. This guide covers
the fork → scaffold → validate → PR flow. **One plugin per PR.**

> **Looking for how to *build* a plugin?** The PHP side — `Plugin.php` extending
> `App\Plugins\AbstractPlugin`, the `App\Plugins\Register*` builders, site types,
> server features, views — is documented at
> <https://vitodeploy.com/docs/plugins>. The best reference is the real code in
> [`plugins/`](plugins/). Authoring needs **PHP 8.4**; the tooling here needs
> **Node ≥ 20**.

## 1. Fork and scaffold

Fork this repo, then create your plugin under `plugins/`. Start from the copyable
starter in [`examples/hello-world`](examples/hello-world):

```bash
cp -R examples/hello-world plugins/my-plugin
```

> **Don't full-clone.** This repo holds every published plugin and grows large.
> Use a partial + sparse checkout:
>
> ```bash
> git clone --filter=blob:none --sparse https://github.com/vitodeploy/plugins
> cd plugins
> git sparse-checkout set plugins/my-plugin scripts schema examples
> ```

The directory name **must** equal the package part of the composer `name` (the
part after `vendor/`), and must match `^[a-z0-9][a-z0-9-]*$`.

## 2. Set name, namespace, and manifest

The manifest is a real `composer.json` carrying marketplace metadata under
`extra.vito`. Keep the `"$schema"` line at the top — it gives editors
autocomplete and inline validation. Edit:

- **`name`** → `<your-vendor>/<my-plugin>` (the package part **must** equal the
  directory name).
- **`version`** → semver (`MAJOR.MINOR.PATCH`). Published versions are immutable.
- **`autoload.psr-4`** → map `App\Vito\Plugins\<Vendor>\<Name>\` to `""` (the
  plugin root), where `<Vendor>` and `<Name>` are the StudlyCase of your vendor
  and the package part (e.g. `my-plugin` → `MyPlugin`).
- **`Plugin.php`** at the plugin root → declare the matching
  `namespace App\Vito\Plugins\<Vendor>\<Name>;` and define `class Plugin extends
  AbstractPlugin`. This is what Vito's loader discovers.
- **`extra.vito`** → the listing metadata (`name`, `categories`, `homepage`,
  `repository`, `author`, `icon`, optional `screenshots`, …).

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/vitodeploy/plugins/main/schema/manifest.schema.json",
  "name": "your-vendor/my-plugin",
  "description": "What your plugin does.",
  "version": "1.0.0",
  "license": "AGPL-3.0-only",
  "type": "vito-plugin",
  "autoload": {
    "psr-4": { "App\\Vito\\Plugins\\YourVendor\\MyPlugin\\": "" }
  },
  "extra": {
    "vito": {
      "name": "My Plugin",
      "categories": ["laravel"],
      "homepage": "https://example.com/my-plugin",
      "repository": "https://github.com/your-vendor/your-repo",
      "author": { "name": "Your Name", "github": "your-handle" },
      "official": false,
      "min_vito_version": "3.0.0",
      "icon": "assets/icon.svg",
      "screenshots": ["assets/screenshot-1.png"]
    }
  }
}
```

## 3. Add an icon (and optional screenshots)

Every plugin needs a listing **icon**. Screenshots are optional.

- **Icon** (`extra.vito.icon`, required): an **SVG** (≤ 512 KB), or a **square
  PNG ≥ 256×256** (≤ 1 MB).
- **Screenshots** (`extra.vito.screenshots`, optional): **PNG, exactly
  1600×1000 (16:10)**, ≤ 3 MB each, **at most 6**.

Both must be referenced by relative paths that stay inside your plugin directory.

## 4. Write a README

Every plugin needs a `README.md`. Cover, briefly: what it does, anything it
runs (shell, network, etc.) and why, and optionally an embedded screenshot for
readers browsing the repo.

## 5. Validate locally

```bash
npm install
node scripts/validate.mjs my-plugin       # one plugin
node scripts/validate.mjs                  # all plugins
node scripts/pack.mjs --dry-run my-plugin  # prove it zips + see its sha256
```

### Rules CI enforces (hard failures)

These must pass before a PR can merge:

- **Schema.** `composer.json` matches
  [`schema/manifest.schema.json`](schema/manifest.schema.json) (required
  top-level `name`, `description`, `version`, `autoload`, `extra`;
  `type: "vito-plugin"`; required `extra.vito.name` + `extra.vito.icon`).
  `composer validate` must also accept it as a real manifest.
- **Directory = package name.** The directory under `plugins/` equals the
  package part of the composer `name`.
- **Namespace consistency.** `autoload.psr-4` maps the expected prefix
  `App\Vito\Plugins\<Vendor>\<Name>\` to `""` (the plugin root).
- **`Plugin.php` present** at the plugin root, declaring
  `namespace App\Vito\Plugins\<Vendor>\<Name>;` and defining `class Plugin`.
- **`README.md` present.**
- **Icon present and valid** (SVG, or square PNG ≥ 256×256, within size limits).
- **Screenshots valid** if present (PNG 1600×1000, ≤ 6, within size limits).
- **No path escapes.** Every referenced asset resolves inside the plugin
  directory, and no symlinks.
- **One plugin per PR + forward semver bump.** A PR may change exactly one
  plugin directory; if the plugin already exists, `version` must bump forward
  (no downgrades — published versions are immutable). The PR title is forced to
  `<slug> <version>`. (Enforced data-only over `composer.json`, never by running
  PR code.)

### Advisory checks (surfaced to reviewers, not hard failures)

A security lint flags these for the human reviewer — ship readable source and
keep your footprint minimal:

- Shell execution: `exec` / `shell_exec` / `system` / `passthru` /
  `proc_open` / `popen`.
- `eval()`, and `assert()` called with a string (eval-like).
- `unserialize()` (object-injection risk).
- `base64_decode()` (possible obfuscation).
- Network access: `curl_exec`, `file_get_contents("http…")`,
  `fopen("http…")`, `Http::`.
- Very long lines (> 2000 chars) — likely minified; ship readable source.
- Declaring extra Composer `require` deps — plugins run inside the host app and
  use host classes; extra deps are flagged for host-compatibility review.

## 6. Open a pull request

Push your branch and open a PR. Fill in the PR template. CI runs validation; a
VitoDeploy maintainer reviews for safety and quality, then squash-merges. On
merge, your plugin is packed, hashed, signed, released, and added to the catalog.

## Versioning

Published versions are **immutable** — the previous version's bytes and SHA-256
never change, so already-installed users are never surprised. To update a plugin,
open a PR that **bumps `version`** and changes the files; the same review and
publish flow applies.

## Removing a plugin

Open a PR that **deletes the `plugins/<slug>/` directory**. If a plugin is not
yours and should be taken down (malicious, abusive, or policy-violating),
[file a report](.github/ISSUE_TEMPLATE/2-report-plugin.yml) instead — see
[`SECURITY.md`](SECURITY.md).
