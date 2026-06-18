#!/usr/bin/env node
// Pack, sign, and publish changed plugins as GitHub Releases, then regenerate
// the catalog. GitHub IS the marketplace API: each plugin version is a Release
// (<slug>-v<version>) carrying the signed zip, both .minisig signatures, the
// signed metadata.json, and the listing assets. Idempotent: an existing
// <slug>-v<version> release with the same bytes is left untouched.
//
// Two minisign (Ed25519) signatures per publish:
//   1. over the zip
//   2. over metadata.json, which binds name/version/sha256/permissions/asset
//      hashes — so every trusted fact is signature-covered.
//
// Requires: `gh` CLI authenticated, `minisign` installed, MINISIGN_SECRET_KEY set.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  expectedPluginClass,
  isMainModule,
  pluginDir,
  manifestPath,
  readManifest,
} from "./lib/paths.mjs";
import { packPlugin } from "./pack.mjs";

const SECRET_KEY = process.env.MINISIGN_SECRET_KEY;
const REPO = process.env.VITO_PLUGINS_REPO || "vitodeploy/plugins";
const DRY_RUN = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function releaseTag(slug, version) {
  return `${slug}-v${version}`;
}

// minisign -W (password-less) over arbitrary bytes; returns the .minisig text.
function signBytes(bytes) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vito-sign-"));
  const dataPath = path.join(tmp, "data");
  const keyPath = path.join(tmp, "minisign.key");
  try {
    fs.writeFileSync(dataPath, bytes);
    fs.writeFileSync(keyPath, SECRET_KEY, { mode: 0o600 });
    execFileSync("minisign", ["-S", "-W", "-s", keyPath, "-m", dataPath], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    return fs.readFileSync(`${dataPath}.minisig`, "utf8");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// The signed metadata document — the authoritative facts the app consents to.
function metadataFor(slug, packed) {
  const m = readManifest(pluginDir(slug));
  const vito = m.vito;
  const dir = pluginDir(slug);

  const asset = (relative) => {
    if (!relative) return null;
    const data = fs.readFileSync(path.join(dir, relative));
    return { filename: path.basename(relative), sha256: sha256(data) };
  };

  return {
    name: m.name,
    slug,
    version: packed.version,
    sha256: packed.sha256,
    size: packed.size,
    description: m.description,
    namespace: expectedPluginClass(m),
    categories: vito.categories ?? [],
    min_vito_version: vito.min_vito_version ?? null,
    icon: asset(vito.icon),
    screenshots: (vito.screenshots ?? []).map(asset),
  };
}

// Does a release tag already exist? (idempotency guard)
function releaseExists(tag) {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", REPO], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ghCreateRelease(tag, title, notes, assets) {
  const args = [
    "release",
    "create",
    tag,
    "--repo",
    REPO,
    "--title",
    title,
    "--notes",
    notes,
    ...assets,
  ];
  execFileSync("gh", args, { stdio: ["ignore", "inherit", "inherit"] });
}

function writeTemp(dir, name, data) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, data);
  return p;
}

function publishPlugin(slug) {
  const packed = packPlugin(slug);
  const tag = releaseTag(slug, packed.version);
  const zipName = `${slug}-${packed.version}.zip`;

  if (releaseExists(tag)) {
    console.log(`skip ${tag} (release already exists; versions are immutable)`);
    return;
  }

  const metadata = metadataFor(slug, packed);
  const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2) + "\n", "utf8");

  if (DRY_RUN) {
    console.log(
      `would publish ${tag} (${packed.size} bytes, sha256=${packed.sha256}) ` +
        `+ ${metadata.screenshots.length} screenshot(s)`,
    );
    return;
  }

  const zipSig = signBytes(packed.zip);
  const metaSig = signBytes(metadataBytes);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vito-pub-"));
  try {
    const dir = pluginDir(slug);
    const m = readManifest(dir);
    const assets = [];
    assets.push(writeTemp(tmp, zipName, packed.zip));
    assets.push(writeTemp(tmp, `${zipName}.minisig`, zipSig));
    assets.push(writeTemp(tmp, "metadata.json", metadataBytes));
    assets.push(writeTemp(tmp, "metadata.json.minisig", metaSig));
    // Listing assets, flattened to basename (catalog URLs use basename).
    if (m.vito.icon) {
      assets.push(writeTemp(tmp, path.basename(m.vito.icon), fs.readFileSync(path.join(dir, m.vito.icon))));
    }
    for (const shot of m.vito.screenshots ?? []) {
      assets.push(writeTemp(tmp, path.basename(shot), fs.readFileSync(path.join(dir, shot))));
    }

    const title = `${m.vito.name ?? slug} ${packed.version}`;
    const notes = `${m.description ?? ""}\n\nsha256: \`${packed.sha256}\``;
    ghCreateRelease(tag, title, notes, assets);
    console.log(`✓ published ${tag} (sha256=${packed.sha256}) + ${assets.length} asset(s), signed`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const slugs = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (slugs.length === 0) {
    console.log("No changed plugins to publish.");
    return;
  }
  if (!DRY_RUN && !SECRET_KEY) fail("MINISIGN_SECRET_KEY is not set.");

  for (const slug of slugs) {
    if (!fs.existsSync(manifestPath(pluginDir(slug)))) {
      console.log(`skip ${slug} (removed)`);
      continue;
    }
    publishPlugin(slug);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
