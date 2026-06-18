# Security Policy

## Reporting a vulnerability in the tooling

For a vulnerability in this repo's validation, packaging, signing, or CI — or in
how the VitoDeploy app verifies and installs plugins — **do not open a public
issue.** Use
[GitHub's private vulnerability reporting](https://github.com/vitodeploy/plugins/security/advisories/new).

Expect acknowledgment within 48 hours and a fix plan within 7 days for confirmed
issues.

## Reporting a malicious or abusive plugin

If a **listed plugin** behaves maliciously (data exfiltration, unexpected shell
or network use, etc.) or violates policy, file a
[report](.github/ISSUE_TEMPLATE/2-report-plugin.yml). Maintainers triage these
with priority and can unlist the plugin by removing its directory, which drops
it from the next published catalog.

## How integrity is guaranteed

Each plugin is signed individually at publish time. **Two** minisign (Ed25519)
signatures are produced: one over the plugin zip, and one over a metadata
document that binds `name`, `version`, the zip's SHA-256, the declared
capabilities/categories, and a SHA-256 for each listing asset (icon,
screenshots). The matching public key is committed as `minisign.pub` and
**pinned in the VitoDeploy app**.

When the signed-install path lands (see below), the app enforces this trust
chain, in order:

1. **Pinned key.** The app bundles VitoDeploy's minisign public key.
2. **Verify the signed metadata.** Download the metadata document and its
   signature; verify against the pinned key. Reject on failure. **All trusted
   facts are taken from this signed document** — never from unauthenticated API
   fields or headers.
3. **Verify the zip signature** against the pinned key, and require the zip's
   SHA-256 to equal the one in the signed metadata.
4. **Match what was requested.** Require the signed `name`/`version` to equal
   what the app asked to install (rejects downgrade/rollback and cross-listing
   substitution).
5. **Verify asset hashes.** Check each listing asset (icon/screenshots) against
   the SHA-256s in the signed metadata before displaying them.
6. **Re-validation.** Unpack to a temporary directory and run the same manifest
   validation the loader relies on (schema, namespace ↔ folder, `Plugin.php`).
7. **Install** into `app/Vito/Plugins/<Vendor>/<Name>/`.

Because both the bytes **and** the facts (version, categories, asset hashes) are
covered by a signature from a key that never leaves CI, a compromised host or
transport cannot substitute bytes, misrepresent the listing, or roll a user back
to an older signed version.

> **v1 is discovery/display.** The catalog is published for browsing today;
> **enforced signed-install in the app is a fast-follow.** The trust anchor
> (`minisign.pub`) ships ahead of the installer work so the pinned key is already
> in users' hands when the verify path lands.

### Signing key

The minisign secret key exists only as a GitHub Actions secret
(`MINISIGN_SECRET_KEY`) used by the publish workflow. It is an **unencrypted
(password-less) key** — the workflow signs with `minisign -W` — so its protection
is the Actions secret store alone. The matching public key is committed as
[`minisign.pub`](minisign.pub) and pinned in the app.

Required safeguards (the key is the entire root of trust):

- **Protected environment.** Scope `MINISIGN_SECRET_KEY` to a GitHub Actions
  environment with **no fork access**, so no PR-triggered workflow can read it.
  Publish runs only on `main`; PR validation runs with a read-only token and no
  secrets.
- **No untrusted interpolation.** The publish workflow never expands
  attacker-controlled values into shell (plugin slugs are passed via env and
  matched against a strict allowlist); a CI guard refuses to publish while
  `minisign.pub` is still the placeholder.
- **Rotation.** Rotate on a schedule and immediately on any suspicion of
  exposure. Pin more than one public key, sign with both for a transition
  window, then retire the old key.

### Compromise and exposure window

If `MINISIGN_SECRET_KEY` leaks, an attacker can sign malicious zips that pass the
pinned-key check until users update the app — **the maximum exposure window is
the app's update cadence.** Planned hardening (a forced-update kill-switch, a
transparency log, and a signed revocation list the app checks) shrinks and makes
a compromise detectable without an app update. Until then, the window is bounded
by update cadence — documented here intentionally.
