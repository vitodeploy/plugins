#!/usr/bin/env node
// Deterministically zip a plugin's runtime files and report its sha256. PHP
// plugins ship source as-is (no build step); we exclude dev cruft and any
// host-provided trees (vendor/node_modules). The zip nests files under
// <slug>/... to match Vito's GitHub-release extraction layout (single root dir).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  PACK_EXCLUDED_DIRS,
  PACK_EXCLUDED_FILES,
  isMainModule,
  pluginDir,
  readManifest,
  repoRoot,
  targetsFromArgv,
} from "./lib/paths.mjs";
import { buildZip } from "./lib/zip.mjs";

function collectFiles(dir, prefix, out) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (PACK_EXCLUDED_DIRS.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`, out);
      continue;
    }
    if (PACK_EXCLUDED_FILES.has(entry.name)) continue;
    out.push({ name: `${prefix}${entry.name}`, data: fs.readFileSync(path.join(dir, entry.name)) });
  }
}

export function packPlugin(slug) {
  const dir = pluginDir(slug);
  if (!fs.existsSync(dir)) {
    throw new Error(`${slug}: plugin directory not found`);
  }
  const { version } = readManifest(dir);
  if (!version) {
    throw new Error(`${slug}: composer.json has no top-level "version"`);
  }
  const files = [];
  collectFiles(dir, `${slug}/`, files);
  const zip = buildZip(files);
  const sha256 = crypto.createHash("sha256").update(zip).digest("hex");
  return { slug, version, zip, sha256, size: zip.length };
}

function outDir() {
  return path.join(repoRoot, "dist");
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const targets = targetsFromArgv(argv);

  if (targets.length === 0) {
    console.log("No plugins to pack.");
    return;
  }

  for (const slug of targets) {
    const { version, zip, sha256, size } = packPlugin(slug);
    const relative = `${slug}/${version}/${slug}-${version}.zip`;
    if (dryRun) {
      console.log(`${slug}@${version}  ${size} bytes  sha256=${sha256}  (dry-run)`);
      continue;
    }
    const target = path.join(outDir(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, zip);
    console.log(`${slug}@${version}  ${size} bytes  sha256=${sha256}  -> dist/${relative}`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
