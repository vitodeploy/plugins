# VitoDeploy Plugins Marketplace — Design

> Status: **Approved direction, building v1.**
> Repo: `vitodeploy/plugins` (public) — this directory, `~/Projects/vito-plugins`.
> App: `vitodeploy/vito` at `~/Projects/vito` (the Laravel app users self-host).
> Plugins live in the root `plugins/` folder, one directory per plugin.
> Modeled on `muxy-app/extensions` (`~/Projects/muxy-extensions`), PHP/Composer-flavored.

## 1. Goals

- A public GitHub **monorepo** where the official plugins live and anyone can
  **fork → add a plugin → open a PR** to get it listed.
- Every merged plugin is **validated, zipped, hashed, and signed** as a
  tamper-evident artifact.
- On merge, CI **uploads** each changed plugin (signed zip + signed metadata +
  listing assets) to the **VitoDeploy marketplace API** at vitodeploy.com. The
  backend stores the artifacts and serves the marketplace listing.
- The Vito app shows a **catalog** of plugins (name, description, icon,
  categories) with **a link to each plugin's home page** — a discovery surface,
  exactly like muxy's marketplace listing.

## 2. Why this differs from Vito today

Vito **already** has a plugin system and a rudimentary "marketplace":

- A plugin today = its own GitHub repo of raw PHP (`Plugin.php` extending
  `App\Plugins\AbstractPlugin`, plus `SiteTypes/`, `Actions/`, `views/`). **No
  `composer.json`, no manifest** — the namespace is derived from the GitHub
  `owner/repo` (e.g. `App\Vito\Plugins\Vitodeploy\LaravelReverbPlugin`).
- The app's "Official"/"Community" tabs are **GitHub search queries** over repos
  tagged with the `vitodeploy-plugin` topic
  (`resources/js/pages/plugins/components/official.tsx`,
  `.../community.tsx`).
- Install = download a repo's latest **GitHub Release** zip → extract to
  `app/Vito/Plugins/{Owner}/{Repo}/` → discover + boot
  (`app/Actions/Plugins/Github/InstallGithubPlugin.php`).

This design **adds the registry/marketplace layer** on top: a single curated
monorepo with composer.json manifests, deterministic signed artifacts, and a
backend that ingests them and serves the marketplace. The 3 official plugins
move *into* this repo.

### What is in v1 vs deferred

- **v1 (this work):** the monorepo + manifest schema + validate/pack/sign/publish
  scripts + CI + the 3 migrated plugins + uploading signed artifacts to the
  vitodeploy.com marketplace API, **and** wiring Vito's marketplace UI to read
  that listing (display + homepage link).
- **Deferred (not v1):** rewiring Vito's *installer* to consume signed monorepo
  artifacts and derive the namespace from `composer.json`. Vito's existing
  GitHub-URL/release install flow stays as-is. The marketplace is discovery only
  for now; "Install" continues to use the existing path (or links out).

## 3. End-to-end flow

```
Author forks repo
  └─ adds plugins/<name>/  (composer.json + PHP source + assets)
  └─ opens PR
        │
        ▼
   CI Checks (PR)                          ← validate-only, never publishes
   ├─ composer.json schema validation (incl. extra.vito block)
   ├─ composer validate (real Composer manifest)
   ├─ name/dir rules + PSR-4 namespace ↔ folder consistency
   ├─ path-escape & resource-existence checks (icon, screenshots, views)
   ├─ Plugin.php exists, namespace matches autoload.psr-4
   ├─ security lint (exec/shell_exec/eval/network/obfuscation → advisory)
   ├─ one-plugin-per-PR + semver bump gate (pull_request_target, data-only)
   └─ dry-run pack (prove deterministic zip + print sha256)
        │
        ▼
   Manual Review (CODEOWNERS / maintainers)
        │  squash-merge to main
        ▼
   CI Publish (push to main)               ← incremental: only CHANGED plugins
   └─ for EACH changed plugin, independently:
       ├─ pack deterministically (fixed order, epoch mtimes → stable sha256)
       ├─ sha256(zip)
       ├─ sign the zip AND a metadata doc (name,version,sha256,asset hashes)
       │  with the Vito release key (minisign -W) → two .minisig
       └─ POST zip + sigs + metadata + assets to the marketplace API
          (vitodeploy.com/api/plugins/upload), one multipart request
        │
        ▼
   VitoDeploy backend (vitodeploy.com)      ← the marketplace API
   ├─ verifies the request against the metadata + headers, stores the artifact
   └─ serves the marketplace listing + signed zip/signatures to the app
        │
        ▼
   Vito App
   ├─ Marketplace UI fetches the listing → browse/search
   ├─ shows name, description, icon, categories, "Home page" link
   └─ (deferred) install: download signed zip → verify minisign → extract
```

## 4. Repository layout

```
vito-plugins/                       # github.com/vitodeploy/plugins
├── README.md                       # what this is, how to browse, how to contribute
├── CONTRIBUTING.md                 # author guide: fork → dev → validate → PR
├── SECURITY.md                     # report a malicious plugin / tooling vuln
├── CODE_OF_CONDUCT.md
├── LICENSE                         # AGPL-3.0 (matches Vito)
├── DESIGN.md                       # this file
├── minisign.pub                    # committed signing public key, pinned by Vito
│
├── plugins/
│   └── <name>/                     # one dir per plugin; <name> == composer.json name's package part
│       ├── composer.json           # REQUIRED manifest (PSR-4 + extra.vito)
│       ├── README.md               # REQUIRED
│       ├── Plugin.php              # REQUIRED entry (extends App\Plugins\AbstractPlugin)
│       ├── SiteTypes/ Actions/ ServerFeatures/ ...   # plugin PHP code
│       ├── views/                  # optional blade views
│       └── assets/
│           ├── icon.svg|png        # REQUIRED listing icon (svg, or square png ≥256)
│           └── screenshot-*.png    # optional listing screenshots (1600×1000)
│
├── schema/
│   └── manifest.schema.json        # JSON Schema for composer.json + extra.vito
│
├── scripts/
│   ├── lib/
│   │   ├── paths.mjs               # repo paths, plugin discovery, manifest reader
│   │   ├── zip.mjs                 # deterministic zip writer (stored, epoch mtime)
│   │   ├── crc32.mjs               # checksum for zip entries
│   │   └── images.mjs              # icon/screenshot dimension + size checks (no deps)
│   ├── validate.mjs                # validate one/all plugins (CI + local)
│   ├── pack.mjs                    # deterministic zip + sha256 for one plugin
│   └── publish.mjs                 # pack + sign + upload changed plugins to the API
│
├── .github/
│   ├── workflows/
│   │   ├── validate.yml            # on PR: validate + dry-run pack + meta gate
│   │   └── publish.yml             # on push to main: pack + sign + upload
│   ├── ISSUE_TEMPLATE/
│   │   ├── 1-new-plugin.yml
│   │   ├── 2-report-plugin.yml     # security/abuse report
│   │   └── 3-bug.yml
│   ├── pull_request_template.md
│   └── CODEOWNERS
│
└── examples/
    └── hello-world/                # copyable starter plugin
```

### Naming rules
The directory name **must** equal the package part of the composer `name`
(the part after `vendor/`), and must match `^[a-z0-9][a-z0-9-]*$`. The PSR-4
namespace declared in `autoload.psr-4` must resolve `Plugin.php` to the class
`App\Vito\Plugins\<Vendor>\<Name>\Plugin` (StudlyCase of vendor + name), so the
plugin loads under Vito's existing discovery scheme. CI checks this consistency.

## 5. The manifest: `composer.json` with `extra.vito`

A plugin's manifest is a **real `composer.json`** (so authors get IDE/composer
support) carrying the marketplace metadata under `extra.vito`. This mirrors
muxy's "package.json + `muxy` key" pattern.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/vitodeploy/plugins/main/schema/manifest.schema.json",
  "name": "vitodeploy/laravel-reverb",
  "description": "Laravel Reverb plugin for VitoDeploy",
  "version": "2.0.0",
  "license": "AGPL-3.0-only",
  "type": "vito-plugin",
  "autoload": {
    "psr-4": {
      "App\\Vito\\Plugins\\Vitodeploy\\LaravelReverb\\": ""
    }
  },
  "extra": {
    "vito": {
      "name": "Laravel Reverb",
      "categories": ["laravel", "websockets"],
      "homepage": "https://vitodeploy.com/docs/plugins/laravel-reverb",
      "repository": "https://github.com/vitodeploy/plugins",
      "author": { "name": "VitoDeploy", "github": "vitodeploy" },
      "official": true,
      "min_vito_version": "3.0.0",
      "icon": "assets/icon.svg",
      "screenshots": ["assets/screenshot-1.png"]
    }
  }
}
```

- **Top-level `name`/`description`/`version`** are standard composer fields and
  the source of truth for identity. `version` is semver; published versions are
  **immutable** and the PR gate enforces a forward bump.
- **`autoload.psr-4`** is authoritative for the namespace. `Plugin.php` lives at
  the plugin root, so the PSR-4 prefix maps to `""` (the plugin dir).
- **`extra.vito`** carries everything the marketplace listing needs; Vito's
  plugin *loader* ignores it (it only cares about `Plugin.php`).
- **`min_vito_version`** lets the marketplace/app hide plugins incompatible with
  the running Vito version (advisory in v1).

The published schema (`schema/manifest.schema.json`) is the single source for CI
and editor autocomplete.

## 6. The upload contract — the marketplace API

There is **no committed catalog**. CI is the single trusted publisher: on every
push to `main`, `scripts/publish.mjs` packs each changed plugin and POSTs it to
the marketplace API at `vitodeploy.com/api/plugins/upload` as one
`multipart/form-data` request. The backend stores the artifact and owns the
marketplace listing the app renders.

The wire format mirrors what the API's `UploadPluginRequest` validates:

```
POST https://vitodeploy.com/api/plugins/upload
Authorization: Bearer <VITO_UPLOAD_TOKEN>
X-Plugin-Name / X-Plugin-Version / X-Plugin-Sha256   ← cross-checked against metadata + bytes

multipart/form-data:
  artifact          the packed zip (file)
  signature         minisign signature over the zip (string)
  metadata          the signed metadata document (file, application/json)
  metadataSignature minisign signature over metadata.json (string)
  icon              listing icon (file, hash declared in metadata)
  screenshot-N      listing screenshots (files, hashes declared in metadata)
```

The signed `metadata.json` is the authoritative facts the API consents to —
`name`, `slug`, `version`, zip `sha256`/`size`, `description`, `namespace`,
`categories`, `min_vito_version`, and a `field`+`filename`+`sha256` entry for
the icon and each screenshot. The API cross-checks the `X-Plugin-*` headers and
the received bytes against this signed document, so every trusted fact is
signature-covered (see §7).

Auth is a static bearer token (the single trusted publisher): the API compares
`Authorization: Bearer <token>` against its `PLUGINS_UPLOAD_TOKEN`. The token is
a GitHub Actions secret (`VITO_UPLOAD_TOKEN`) scoped to the publish workflow.

## 7. Integrity model (signed metadata + signed zip)

Identical to muxy: two minisign (Ed25519) signatures per publish — one over the
zip, one over a metadata document binding `name`, `version`, zip sha256, and
each asset's sha256. The matching public key is committed as `minisign.pub` and
**pinned in the Vito app**.

When the signed-install path lands (deferred), Vito enforces, in order:
pinned key → verify signed metadata → verify zip sig + sha256 matches metadata →
match requested name/version → verify asset hashes → consent from signed facts →
re-validate the unpacked manifest → install into `app/Vito/Plugins/...`.

The secret key lives only as a GitHub Actions secret (`MINISIGN_SECRET_KEY`,
password-less, signed with `minisign -W`) scoped to a protected environment with
no fork access. See SECURITY.md.

## 8. CI

### `validate.yml` (on PR) — never publishes, no secrets to fork PRs
1. `validate` job (`pull_request`, read-only token): set up Node + PHP/Composer,
   run `composer validate` on each changed plugin, run `scripts/validate.mjs`,
   then `scripts/pack.mjs --dry-run`.
2. `pr-meta` job (`pull_request_target`, writable token, **data-only** — reads
   `composer.json` via `jq`, never executes PR code): enforce one-plugin-per-PR,
   semver forward-bump, force PR title to `<name> <version>`, ping plugin author.

### `publish.yml` (on push to main) — incremental, `O(changed)`
1. Skip unless `minisign.pub` is real and `MINISIGN_SECRET_KEY` is set.
2. Diff the merge → changed plugin dirs (or `workflow_dispatch` explicit list).
3. For each: validate → `scripts/pack.mjs` → `minisign -S -W` (zip + metadata) →
   `scripts/publish.mjs` POSTs the signed zip + signatures + metadata + assets to
   `vitodeploy.com/api/plugins/upload`.

Determinism: re-running publish on an unchanged plugin yields the identical zip
and hash, so redundant uploads dedupe by `name@version + sha256` on the backend.

## 9. Packaging rules (PHP-specific divergence from muxy)

- **No build step.** PHP plugins ship source as-is. `pack.mjs` zips the plugin
  directory directly (there is no Vite/`dist/`).
- **Excluded from the zip:** `.git`, `.github`, `node_modules`, `vendor`,
  `.DS_Store`, `Thumbs.db`, tests, and any `*.dist`/CI dotfiles — ship only the
  runtime plugin (PHP + views + assets + composer.json).
- **No lockfile requirement.** Vito plugins don't bring their own Composer deps
  (they run inside the host app and use the host's classes). If a plugin *does*
  declare `require`, that's flagged for review (it can't pull host-conflicting
  deps); v1 plugins require nothing beyond the host.
- **Deterministic zip:** fixed entry order, epoch mtimes, stored (uncompressed)
  → stable bytes → stable sha256 (reuses muxy's `lib/zip.mjs` verbatim).

## 10. Security lint (advisory, PHP)
Flag for the human reviewer (not hard failures): `exec`/`shell_exec`/`system`/
`passthru`/`proc_open`/`popen`, `eval`/`assert(` with a string, `base64_decode`
chains, network calls (`file_get_contents("http`/`curl_`/`fopen("http`/
`Http::`), `unserialize`, and very long/minified lines. Hard failures: schema
violations, namespace/folder mismatch, missing `Plugin.php`/`README.md`/icon,
path escapes, invalid `composer.json`.

## 11. Vito app-side changes (v1)

In `~/Projects/vito`:
- A **marketplace listing** rendered from the plugins uploaded to the backend
  (replacing or augmenting the GitHub-search queries in `official.tsx` /
  `community.tsx`).
- Render the listing: name, description, icon, categories, a **"Home page"**
  link (`extra.vito.homepage`), and a star/repository link.
- Keep the existing GitHub-URL install dialog working unchanged.
- Commit the pinned `minisign.pub` into the app for the future verify path
  (added now so the trust anchor ships ahead of the installer work).

## 12. Decisions

Resolved:
- **Repo = monorepo of plugin code**, public, `vitodeploy/plugins`, plugins in
  root `plugins/`. ✓
- **Manifest = `composer.json` with `extra.vito`**, PSR-4 namespace
  authoritative. ✓
- **Publishing = upload to the vitodeploy.com marketplace API** (signed zip +
  signed metadata + assets); the backend owns the listing. ✓
- **Signing = minisign/Ed25519**, pinned `minisign.pub`, two sigs (zip +
  metadata), key only in CI. ✓
- **Publish granularity = incremental** (only changed plugins). ✓
- **v1 app-side = marketplace display + homepage link**; installer rewiring
  deferred. ✓

Open (non-blocking; sensible defaults applied):
1. **Per-plugin `min_vito_version` enforcement** — advisory in v1 (metadata
   carries it; app may grey-out incompatible plugins later).
2. **Community tier** — keep GitHub-topic search for non-monorepo community
   plugins alongside the curated marketplace, or require all via PR. Default:
   keep topic-search community tab for now; official tab reads the marketplace.
```
