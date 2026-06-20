#!/usr/bin/env node
// Run a plugin's PHPUnit tests INSIDE a checkout of the host VitoDeploy app.
//
// Plugin code (Plugin.php, Actions/, SiteTypes/, ...) references classes that
// only exist in the host app (App\SiteFeatures\Action, App\Models\Worker,
// App\Plugins\Register*, SSH::fake(), the auto-provisioned $this->site/$this->server
// from the host's Tests\TestCase). There is no standalone autoloading here, so we
// can't run a plugin's tests in isolation — we stage the plugin + its tests into a
// real host checkout and run the host's PHPUnit there.
//
// For each target plugin that ships a tests/ directory we:
//   1. compute its host install path from the manifest namespace
//      (App\Vito\Plugins\<Vendor>\<Name>\ -> app/Vito/Plugins/<Vendor>/<Name>/),
//   2. copy the plugin source there (minus tests/ and dev cruft),
//   3. copy the plugin's tests/ into the host's Feature suite at
//      tests/Feature/Plugins/<Vendor>/<Name>/. The host's phpunit.xml discovers
//      tests/Feature recursively (suffix Test.php), and the tests extend
//      Tests\TestCase, so they inherit the auto-provisioned $this->site/$this->server.
//   4. run `./vendor/bin/phpunit` scoped to that directory,
//   5. always clean up both staged trees, even on failure.
//
// Plugins WITHOUT a tests/ directory are skipped (reported, not failed) — tests
// are opt-in per plugin, but when present they must pass (CI gates on the exit code).
//
// Usage:
//   node scripts/test.mjs [slug...] --vito <path-to-vito-checkout>
//   VITO_PATH=/path/to/vito node scripts/test.mjs
//
// Flags:
//   --vito <path>   host VitoDeploy checkout (default: $VITO_PATH, else ../vito)
//   --filter <expr> passed through to PHPUnit --filter
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  expectedNamespace,
  listPluginSlugs,
  PACK_EXCLUDED_DIRS,
  PACK_EXCLUDED_FILES,
  pluginDir,
  pluginsDir,
  readManifest,
} from "./lib/paths.mjs";

const TESTS_DIRNAME = "tests";

function parseArgs(argv) {
  const slugs = [];
  let vito = process.env.VITO_PATH ?? path.resolve(pluginsDir, "..", "..", "vito");
  let filter = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--vito") {
      vito = argv[(i += 1)];
    } else if (arg.startsWith("--vito=")) {
      vito = arg.slice("--vito=".length);
    } else if (arg === "--filter") {
      filter = argv[(i += 1)];
    } else if (arg.startsWith("--filter=")) {
      filter = arg.slice("--filter=".length);
    } else if (!arg.startsWith("-")) {
      slugs.push(arg);
    }
  }
  return { slugs: slugs.length ? slugs : listPluginSlugs(), vito: vito ? path.resolve(vito) : null, filter };
}

// The host install path for a plugin, derived from the manifest namespace:
//   App\Vito\Plugins\<Vendor>\<Name>\  ->  app/Vito/Plugins/<Vendor>/<Name>/
function hostSegments(manifest) {
  const prefix = expectedNamespace(manifest); // "App\\Vito\\Plugins\\Vendor\\Name\\"
  const parts = prefix.split("\\").filter(Boolean); // [App, Vito, Plugins, Vendor, Name]
  return parts.slice(3); // [Vendor, Name]
}

// Recursively copy a plugin source tree, skipping the same dev cruft pack.mjs
// excludes from artifacts (tests/, .git, node_modules, ...). The plugin's tests
// are staged separately into the host suite, not into the runtime tree.
function copyPluginSource(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (PACK_EXCLUDED_DIRS.has(entry.name)) continue;
      copyPluginSource(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    } else if (entry.isFile()) {
      if (PACK_EXCLUDED_FILES.has(entry.name)) continue;
      fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }
}

// Copy the plugin's tests/ verbatim into the host's Feature suite. Plugin tests
// declare `namespace Tests\Feature\Plugins\<Vendor>\<Name>...;` and extend
// Tests\TestCase, matching the host's existing Feature-suite convention.
function copyTests(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTests(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

// Remove now-empty parent dirs we created (e.g. app/Vito/Plugins/<Vendor>) up to
// — but not including — a stop directory, so staging leaves no residue.
function pruneEmptyUp(dir, stopAt) {
  let current = dir;
  while (current.startsWith(stopAt) && current !== stopAt) {
    try {
      if (fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

function runPlugin(slug, vito, filter) {
  const dir = pluginDir(slug);
  const testsDir = path.join(dir, TESTS_DIRNAME);
  if (!fs.existsSync(testsDir)) {
    return { slug, status: "skipped", reason: "no tests/ directory" };
  }

  const manifest = readManifest(dir);
  const [vendor, name] = hostSegments(manifest);
  if (!vendor || !name) {
    return { slug, status: "error", reason: `cannot derive host path from namespace '${expectedNamespace(manifest)}'` };
  }

  const hostPluginRoot = path.join(vito, "app", "Vito", "Plugins");
  const hostSuiteRoot = path.join(vito, "tests", "Feature", "Plugins");
  const stagedPlugin = path.join(hostPluginRoot, vendor, name);
  const stagedTests = path.join(hostSuiteRoot, vendor, name);
  const phpunitBin = path.join(vito, "vendor", "bin", "phpunit");

  if (!fs.existsSync(phpunitBin)) {
    return { slug, status: "error", reason: `PHPUnit not found at ${phpunitBin} — run 'composer install' in the host checkout` };
  }

  // Refuse to clobber a plugin already present in the host checkout (e.g. a real
  // local install); staging must never destroy the developer's tree.
  for (const staged of [stagedPlugin, stagedTests]) {
    if (fs.existsSync(staged)) {
      return { slug, status: "error", reason: `${staged} already exists in the host checkout; remove it before staging` };
    }
  }

  try {
    copyPluginSource(dir, stagedPlugin);
    copyTests(testsDir, stagedTests);

    // Point PHPUnit at the staged dir directly. The host phpunit.xml's <source>
    // whitelist still applies; passing a path overrides the testsuite selection.
    const args = [path.relative(vito, stagedTests)];
    if (filter) args.push("--filter", filter);

    const result = spawnSync(phpunitBin, args, { cwd: vito, stdio: "inherit", env: process.env });
    if (result.error) {
      return { slug, status: "error", reason: result.error.message };
    }
    return { slug, status: result.status === 0 ? "passed" : "failed", code: result.status };
  } finally {
    rmrf(stagedPlugin);
    rmrf(stagedTests);
    pruneEmptyUp(path.dirname(stagedPlugin), hostPluginRoot);
    pruneEmptyUp(path.dirname(stagedTests), hostSuiteRoot);
  }
}

function main() {
  const { slugs, vito, filter } = parseArgs(process.argv.slice(2));

  if (!vito || !fs.existsSync(vito)) {
    console.error(
      `::error::host VitoDeploy checkout not found at '${vito ?? "<unset>"}'.\n` +
        "Pass --vito <path> or set VITO_PATH to a checkout of vitodeploy/vito with 'composer install' run.",
    );
    process.exit(2);
  }

  if (slugs.length === 0) {
    console.log("No plugins to test.");
    return;
  }

  let failed = 0;
  let ran = 0;
  for (const slug of slugs) {
    console.log(`::group::test ${slug}`);
    const result = runPlugin(slug, vito, filter);
    console.log("::endgroup::");
    switch (result.status) {
      case "passed":
        ran += 1;
        console.log(`✓ ${slug}`);
        break;
      case "skipped":
        console.log(`- ${slug} (${result.reason})`);
        break;
      case "failed":
        ran += 1;
        failed += 1;
        console.log(`::error::[${slug}] tests failed (exit ${result.code})`);
        console.log(`✗ ${slug}`);
        break;
      default:
        failed += 1;
        console.log(`::error::[${slug}] ${result.reason}`);
        console.log(`✗ ${slug}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} plugin(s) failed tests.`);
    process.exit(1);
  }
  console.log(`\n${ran} plugin(s) tested, all passing.`);
}

main();
