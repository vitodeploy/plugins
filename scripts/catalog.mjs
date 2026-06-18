#!/usr/bin/env node
// Regenerate catalog/index.json — the published marketplace "API" the Vito app
// reads. One entry per plugin, built from its composer.json + extra.vito, with
// artifact/asset URLs pointing at the plugin's GitHub Release
// (<slug>-v<version>). This file is committed back to main on publish.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  catalogDir,
  expectedPluginClass,
  isMainModule,
  listPluginSlugs,
  pluginDir,
  readManifest,
  repoRoot,
} from "./lib/paths.mjs";
import { packPlugin } from "./pack.mjs";

// Base for release-asset download URLs. Override via env in CI if the repo moves.
const REPO = process.env.VITO_PLUGINS_REPO || "vitodeploy/plugins";
const RELEASE_BASE = `https://github.com/${REPO}/releases/download`;

function releaseTag(slug, version) {
  return `${slug}-v${version}`;
}

function assetUrl(slug, version, filename) {
  return `${RELEASE_BASE}/${releaseTag(slug, version)}/${encodeURIComponent(filename)}`;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Stamp is passed in (CI sets it) so the script stays deterministic when run in
// the workflow runtime. Falls back to null rather than calling Date in tooling.
export function buildCatalog(generatedAt = null) {
  const plugins = [];
  for (const slug of listPluginSlugs()) {
    const dir = pluginDir(slug);
    if (!fs.existsSync(path.join(dir, "composer.json"))) continue;
    const m = readManifest(dir);
    const vito = m.vito;
    const version = m.version;

    // sha256/size of the deterministic artifact (recomputed, cheap, no I/O to releases).
    const packed = packPlugin(slug);

    const zipName = `${slug}-${version}.zip`;
    const entry = {
      name: m.name,
      slug,
      display_name: vito.name ?? slug,
      description: m.description,
      version,
      official: vito.official ?? false,
      categories: vito.categories ?? [],
      homepage: vito.homepage ?? null,
      repository: vito.repository ?? `https://github.com/${REPO}`,
      author: vito.author ?? null,
      min_vito_version: vito.min_vito_version ?? null,
      namespace: expectedPluginClass(m),
      icon_url: vito.icon ? assetUrl(slug, version, path.basename(vito.icon)) : null,
      screenshots: (vito.screenshots ?? []).map((s) => assetUrl(slug, version, path.basename(s))),
      artifact: {
        url: assetUrl(slug, version, zipName),
        sha256: packed.sha256,
        size: packed.size,
        signature_url: assetUrl(slug, version, `${zipName}.minisig`),
        metadata_url: assetUrl(slug, version, "metadata.json"),
        metadata_signature_url: assetUrl(slug, version, "metadata.json.minisig"),
      },
    };
    plugins.push(entry);
  }

  plugins.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { generated_at: generatedAt, schema_version: 1, plugins };
}

function main() {
  const generatedAt = process.env.CATALOG_GENERATED_AT || null;
  const catalog = buildCatalog(generatedAt);
  fs.mkdirSync(catalogDir, { recursive: true });
  const out = path.join(catalogDir, "index.json");
  fs.writeFileSync(out, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Wrote ${path.relative(repoRoot, out)} with ${catalog.plugins.length} plugin(s).`);
}

if (isMainModule(import.meta.url)) {
  main();
}
