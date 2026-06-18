#!/usr/bin/env node
// Validate one or all plugins against the manifest schema and the marketplace
// rules. Used by CI (validate.yml + publish.yml) and locally. Mirrors the rules
// the VitoDeploy app's plugin loader relies on, so anything passing here loads.
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  entryFileName,
  expectedNamespace,
  expectedPluginClass,
  loadSchema,
  manifestPath,
  pluginDir,
  pluginsDir,
  readJSON,
  readManifest,
  referencedAssets,
  resolveInside,
  targetsFromArgv,
} from "./lib/paths.mjs";
import { inspectIcon, inspectScreenshot, SCREENSHOT_MAX_COUNT } from "./lib/images.mjs";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateManifest = ajv.compile(loadSchema());

class Report {
  constructor(slug) {
    this.slug = slug;
    this.errors = [];
    this.warnings = [];
  }
  error(message) {
    this.errors.push(message);
  }
  warn(message) {
    this.warnings.push(message);
  }
  get ok() {
    return this.errors.length === 0;
  }
}

function requireResource(report, dir, relative, label) {
  const { resolved, inside } = resolveInside(dir, relative);
  if (!inside) {
    report.error(`${label} '${relative}' escapes the plugin directory`);
    return false;
  }
  if (!fs.existsSync(resolved)) {
    report.error(`${label} '${relative}' does not exist`);
    return false;
  }
  if (fs.lstatSync(resolved).isSymbolicLink()) {
    report.error(`${label} '${relative}' is a symlink; ship a regular file`);
    return false;
  }
  return true;
}

function checkListingAsset(report, dir, relative, label, inspect) {
  if (!requireResource(report, dir, relative, label)) return;
  const { resolved } = resolveInside(dir, relative);
  for (const issue of inspect(resolved).errors) report.error(`${label} '${relative}' ${issue}`);
}

function checkIdentity(report, slug, manifest) {
  if (manifest.package !== slug) {
    report.error(
      `composer name package part '${manifest.package}' must equal directory name '${slug}'`,
    );
  }
}

// The PSR-4 namespace must map the plugin's expected namespace prefix to "" (the
// plugin root) so Plugin.php resolves to <Namespace>\Plugin under Vito's loader.
function checkNamespace(report, dir, manifest) {
  const expected = expectedNamespace(manifest);
  const psr4 = manifest.psr4 ?? {};
  const entry = Object.entries(psr4).find(([, target]) => target === "" || target === "." || target === "./");

  if (!entry) {
    report.error(
      `autoload.psr-4 must map a namespace to "" (the plugin root); expected prefix '${expected}'`,
    );
    return;
  }
  const [declared] = entry;
  const normalized = declared.endsWith("\\") ? declared : `${declared}\\`;
  if (normalized !== expected) {
    report.error(
      `autoload.psr-4 namespace '${declared}' must be '${expected}' (derived from composer name '${manifest.name}')`,
    );
  }

  // Plugin.php must declare the expected class namespace.
  const entryPath = path.join(dir, entryFileName);
  if (!fs.existsSync(entryPath)) {
    report.error(`${entryFileName} is required at the plugin root`);
    return;
  }
  const source = fs.readFileSync(entryPath, "utf8");
  const nsPrefix = expected.slice(0, -1); // strip trailing backslash
  const nsRegex = new RegExp(`namespace\\s+${nsPrefix.replace(/\\/g, "\\\\")}\\s*;`);
  if (!nsRegex.test(source)) {
    report.error(
      `${entryFileName} must declare 'namespace ${nsPrefix};' (so it loads as '${expectedPluginClass(manifest)}')`,
    );
  }
  if (!/class\s+Plugin\b/.test(source)) {
    report.error(`${entryFileName} must define 'class Plugin'`);
  }
}

function checkListing(report, dir, vito) {
  if (!vito.icon) {
    report.error("extra.vito.icon is required (svg or square png >= 256x256)");
  } else {
    checkListingAsset(report, dir, vito.icon, "icon", inspectIcon);
  }
  const screenshots = vito.screenshots ?? [];
  if (screenshots.length > SCREENSHOT_MAX_COUNT) {
    report.error(`at most ${SCREENSHOT_MAX_COUNT} screenshots allowed, got ${screenshots.length}`);
  }
  screenshots.forEach((shot, index) => {
    checkListingAsset(report, dir, shot, `screenshot #${index + 1}`, inspectScreenshot);
  });
}

// Advisory PHP security lint surfaced to the human reviewer. Never a hard fail.
const LINT_PATTERNS = [
  { re: /\b(exec|shell_exec|system|passthru|proc_open|popen)\s*\(/, msg: "runs shell commands" },
  { re: /\beval\s*\(/, msg: "uses eval()" },
  { re: /\bassert\s*\(\s*['"]/, msg: "uses assert() with a string (eval-like)" },
  { re: /\bunserialize\s*\(/, msg: "uses unserialize() (object-injection risk)" },
  { re: /\bbase64_decode\s*\(/, msg: "uses base64_decode (possible obfuscation)" },
  { re: /\b(curl_exec|file_get_contents\s*\(\s*['"]https?:|fopen\s*\(\s*['"]https?:|Http::)/, msg: "performs network access" },
];
const MIN_MINIFIED_LINE = 2000;

function collectPhpFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "vendor" || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.php$/.test(entry.name)) files.push(full);
    }
  };
  walk(dir);
  return files;
}

function securityLint(report, dir) {
  for (const file of collectPhpFiles(dir)) {
    const rel = path.relative(dir, file);
    const content = fs.readFileSync(file, "utf8");
    for (const { re, msg } of LINT_PATTERNS) {
      if (re.test(content)) report.warn(`${rel}: ${msg} — reviewer: confirm this is justified`);
    }
    const longest = content.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
    if (longest > MIN_MINIFIED_LINE) {
      report.warn(`${rel}: very long line (${longest} chars) — possibly minified; ship readable source`);
    }
  }
}

function validatePlugin(slug) {
  const report = new Report(slug);
  const dir = pluginDir(slug);
  const mPath = manifestPath(dir);

  if (!fs.existsSync(mPath)) {
    report.error("composer.json not found");
    return report;
  }

  let composer;
  try {
    composer = readJSON(mPath);
  } catch (err) {
    report.error(`composer.json is not valid JSON: ${err.message}`);
    return report;
  }

  if (!validateManifest(composer)) {
    for (const err of validateManifest.errors ?? []) {
      report.error(`manifest${err.instancePath} ${err.message}`);
    }
    return report;
  }

  const manifest = readManifest(dir);

  checkIdentity(report, slug, manifest);
  checkNamespace(report, dir, manifest);
  checkListing(report, dir, manifest.vito);

  if (!fs.existsSync(path.join(dir, "README.md"))) {
    report.error("README.md is required for every plugin");
  }

  // Declaring extra runtime composer deps is discouraged (plugins use host
  // classes); surface it for review rather than failing.
  const requires = Object.keys(composer.require ?? {}).filter((k) => k !== "php");
  if (requires.length > 0) {
    report.warn(`declares composer require: ${requires.join(", ")} — reviewer: confirm host compatibility`);
  }

  // Every referenced asset must resolve inside the plugin dir (already covered
  // for icon/screenshots in checkListing; this catches any stragglers).
  for (const relative of referencedAssets(manifest.vito)) {
    requireResource(report, dir, relative, "asset");
  }

  securityLint(report, dir);

  return report;
}

function main() {
  if (!fs.existsSync(pluginsDir)) {
    console.log("No plugins/ directory; nothing to validate.");
    return;
  }
  const slugs = targetsFromArgv(process.argv.slice(2));
  if (slugs.length === 0) {
    console.log("No plugins to validate.");
    return;
  }

  let failed = 0;
  for (const slug of slugs) {
    const report = validatePlugin(slug);
    for (const warning of report.warnings) console.log(`::warning::[${slug}] ${warning}`);
    if (report.ok) {
      console.log(`✓ ${slug}`);
      continue;
    }
    failed += 1;
    for (const error of report.errors) console.log(`::error::[${slug}] ${error}`);
    console.log(`✗ ${slug} (${report.errors.length} error${report.errors.length === 1 ? "" : "s"})`);
  }

  if (failed > 0) {
    console.error(`\n${failed} plugin(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${slugs.length} plugin(s) valid.`);
}

main();
