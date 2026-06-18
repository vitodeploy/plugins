<!--
One plugin per PR. CI forces the title to "<slug> <version>" and enforces the
checks below. See CONTRIBUTING.md for the full author guide.
-->

## What does this plugin do?

<!-- One or two sentences. Link to docs/demo if you have them. -->

## Checklist

- [ ] This PR changes exactly **one** plugin (`plugins/<slug>/`).
- [ ] `version` in `composer.json` is bumped (semver; published versions are immutable).
- [ ] The directory name equals the package part of the composer `name` (`vendor/<slug>`).
- [ ] `autoload.psr-4` maps `App\Vito\Plugins\<Vendor>\<Name>\` to `""`, and `Plugin.php` declares that namespace and a `class Plugin`.
- [ ] `extra.vito` has a `name` and an `icon` (SVG, or square PNG ≥ 256×256).
- [ ] Screenshots (if any) are PNG 1600×1000, at most 6.
- [ ] A `README.md` is present.
- [ ] The source is readable (not minified/obfuscated) and declares only the capabilities it actually uses.
- [ ] I ran `node scripts/validate.mjs <slug>` and `node scripts/pack.mjs --dry-run <slug>` locally.

## Notes for reviewers

<!-- Anything the security/quality reviewer should know: shell usage, network
calls, why a permission is needed, etc. -->
