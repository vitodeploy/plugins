#!/usr/bin/env node
// Pack, sign, and upload changed plugins to the vitodeploy.com marketplace API
// (POST /api/plugins/upload). The plugins repository CI is the single trusted
// publisher: after a maintainer merges a PR, each changed plugin is packed into
// a deterministic zip, signed, and POSTed as one multipart/form-data request.
//
// Two minisign (Ed25519) signatures per publish:
//   1. over the zip
//   2. over metadata.json, which binds name/version/sha256/permissions/asset
//      hashes — so every trusted fact is signature-covered.
//
// The wire format mirrors what the API's UploadPluginRequest validates:
//   - artifact          the packed zip (file)
//   - signature         minisign signature over the zip (string)
//   - metadata          the signed metadata document (file, application/json)
//   - metadataSignature minisign signature over metadata.json (string)
//   - icon, screenshot-N listing assets (files), each hashed in metadata
//   - X-Plugin-Name / X-Plugin-Version / X-Plugin-Sha256 headers, which the
//     API cross-checks against the metadata and the bytes received.
//
// Auth is a static bearer token (the single trusted publisher): the API
// compares Authorization: Bearer <token> against its PLUGINS_UPLOAD_TOKEN.
//
// Requires: Node >=20 (native fetch/FormData/Blob), `minisign` installed,
//   MINISIGN_SECRET_KEY and VITO_UPLOAD_TOKEN set.
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

const UPLOAD_URL = (process.env.VITO_UPLOAD_URL || "https://vitodeploy.com/api/plugins/upload").replace(/\/+$/, "");
const TOKEN = process.env.VITO_UPLOAD_TOKEN;
const SECRET_KEY = process.env.MINISIGN_SECRET_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
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

const CONTENT_TYPES = { ".svg": "image/svg+xml", ".png": "image/png" };

// A listing asset (icon / screenshot) declared in extra.vito, read from the
// plugin directory, with the multipart field it ships under and its hash.
function listingAsset(dir, field, relative) {
  const data = fs.readFileSync(path.join(dir, relative));
  const ext = path.extname(relative).toLowerCase();
  return {
    field,
    filename: path.basename(relative),
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    sha256: sha256(data),
    data,
  };
}

function collectListingAssets(slug) {
  const dir = pluginDir(slug);
  const vito = readManifest(dir).vito;
  const assets = [];
  if (vito.icon) assets.push(listingAsset(dir, "icon", vito.icon));
  (vito.screenshots ?? []).forEach((shot, index) =>
    assets.push(listingAsset(dir, `screenshot-${index}`, shot)),
  );
  return assets;
}

// The signed metadata document — the authoritative facts the API consents to.
// Each asset declares the multipart field it ships under so the API can match
// its file to the declared hash.
function metadataFor(slug, packed, assets) {
  const m = readManifest(pluginDir(slug));
  const vito = m.vito;
  const icon = assets.find((asset) => asset.field === "icon");
  const screenshots = assets.filter((asset) => asset.field.startsWith("screenshot-"));
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
    icon: icon ? { field: icon.field, filename: icon.filename, sha256: icon.sha256 } : null,
    screenshots: screenshots.map((shot) => ({
      field: shot.field,
      filename: shot.filename,
      sha256: shot.sha256,
    })),
  };
}

async function uploadPlugin(slug) {
  const packed = packPlugin(slug);
  const assets = collectListingAssets(slug);
  const metadata = metadataFor(slug, packed, assets);

  if (DRY_RUN) {
    console.log(
      `would upload ${slug}@${packed.version} (${packed.size} bytes, sha256=${packed.sha256}) ` +
        `+ ${metadata.icon ? "icon + " : ""}${metadata.screenshots.length} screenshot(s) -> ${UPLOAD_URL}`,
    );
    return;
  }

  const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2) + "\n", "utf8");
  const zipSignature = signBytes(packed.zip);
  const metadataSignature = signBytes(metadataBytes);

  const form = new FormData();
  form.set("artifact", new Blob([packed.zip], { type: "application/zip" }), `${slug}-${packed.version}.zip`);
  form.set("metadata", new Blob([metadataBytes], { type: "application/json" }), "metadata.json");
  form.set("signature", zipSignature);
  form.set("metadataSignature", metadataSignature);
  for (const asset of assets) {
    form.set(asset.field, new Blob([asset.data], { type: asset.contentType }), asset.filename);
  }

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "X-Plugin-Name": metadata.name,
      "X-Plugin-Version": packed.version,
      "X-Plugin-Sha256": packed.sha256,
    },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    fail(`upload failed for ${slug}@${packed.version}: HTTP ${response.status} ${body}`);
  }
  console.log(
    `✓ uploaded ${slug}@${packed.version} (sha256=${packed.sha256}) + ${assets.length} listing asset(s), metadata signed`,
  );
}

async function main() {
  const slugs = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (slugs.length === 0) {
    console.log("No changed plugins to publish.");
    return;
  }

  if (!DRY_RUN) {
    if (!TOKEN) fail("VITO_UPLOAD_TOKEN is not set.");
    if (!SECRET_KEY) fail("MINISIGN_SECRET_KEY is not set.");
  }

  for (const slug of slugs) {
    if (!fs.existsSync(manifestPath(pluginDir(slug)))) {
      console.log(`skip ${slug} (removed)`);
      continue;
    }
    await uploadPlugin(slug);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => fail(err.message));
}
