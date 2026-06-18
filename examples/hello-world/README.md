# Hello World

A minimal starter VitoDeploy plugin. Copy this directory into `plugins/`, rename
it to your plugin's slug, and edit `composer.json` + `Plugin.php`.

## What it does

Nothing yet — it's a template. `Plugin::boot()` is where you register site
types, server providers, features, views, and more via the `App\Plugins\Register*`
builders.

## Getting started

1. Copy `examples/hello-world` to `plugins/<your-slug>`.
2. In `composer.json`, set:
   - `name` to `<your-vendor>/<your-slug>` (the package part **must** equal the
     directory name).
   - `autoload.psr-4` to `App\\Vito\\Plugins\\<Vendor>\\<Name>\\` (StudlyCase of
     your vendor and slug), mapped to `""`.
   - The matching `namespace` at the top of `Plugin.php`.
   - `extra.vito` listing metadata (name, categories, homepage, icon, …).
3. Replace `assets/icon.svg` with your own icon (SVG, or square PNG ≥ 256×256).
4. Run `node scripts/validate.mjs <your-slug>` and `node scripts/pack.mjs --dry-run <your-slug>`.
5. Open a PR.

## Permissions / capabilities

This template uses none. Declare only what you use and keep the source readable —
shell, network, `eval`, and obfuscation are flagged for human review.
