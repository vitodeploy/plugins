import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const pluginsDir = path.join(repoRoot, "plugins");
export const schemaPath = path.join(repoRoot, "schema", "manifest.schema.json");

// A plugin's manifest IS a real composer.json; marketplace metadata lives under
// extra.vito (the muxy "package.json + muxy key" pattern, PHP-flavored).
export const manifestFileName = "composer.json";

// The required plugin entry class file (extends App\Plugins\AbstractPlugin).
export const entryFileName = "Plugin.php";

// Files/dirs never shipped in a plugin zip — dev cruft and host-provided trees.
export const PACK_EXCLUDED_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "vendor",
  "tests",
  "Tests",
  ".idea",
  ".vscode",
]);
export const PACK_EXCLUDED_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  ".gitattributes",
  "composer.lock",
  "phpunit.xml",
  "phpunit.xml.dist",
]);

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function listPluginSlugs() {
  if (!fs.existsSync(pluginsDir)) return [];
  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export function pluginDir(slug) {
  return path.join(pluginsDir, slug);
}

export function manifestPath(dir) {
  return path.join(dir, manifestFileName);
}

export function loadSchema() {
  return readJSON(schemaPath);
}

// Reads a plugin's composer.json and returns a normalized view.
//  - composer: the raw composer.json object
//  - vito:     the extra.vito marketplace block ({} if absent)
//  - vendor / package: parsed from composer `name` ("vendor/package")
//  - version:  top-level composer `version`
//  - psr4:     the autoload.psr-4 map ({} if absent)
export function readManifest(dir) {
  const composer = readJSON(manifestPath(dir));
  const vito = composer.extra?.vito ?? {};
  const [vendor, pkg] = String(composer.name ?? "").split("/");
  return {
    composer,
    vito,
    name: composer.name ?? null,
    vendor: vendor ?? null,
    package: pkg ?? null,
    description: composer.description ?? null,
    version: composer.version ?? null,
    license: composer.license ?? null,
    psr4: composer.autoload?.["psr-4"] ?? {},
  };
}

// StudlyCase a dash/underscore/space separated string ("laravel-reverb" -> "LaravelReverb").
export function studly(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// The PSR-4 namespace prefix that must map to "" (the plugin root), so that
// Plugin.php resolves to <Namespace>\Plugin under Vito's loader. Derived from
// the composer name: App\Vito\Plugins\<Vendor>\<Package>\
export function expectedNamespace(manifest) {
  const vendor = studly(manifest.vendor ?? "");
  const pkg = studly(manifest.package ?? "");
  return `App\\Vito\\Plugins\\${vendor}\\${pkg}\\`;
}

// The fully-qualified Plugin class Vito will load.
export function expectedPluginClass(manifest) {
  return `${expectedNamespace(manifest)}Plugin`;
}

// Listing assets (icon + screenshots) declared in extra.vito, as repo-relative
// paths inside the plugin directory.
export function referencedAssets(vito) {
  const files = [];
  if (vito.icon) files.push(vito.icon);
  for (const shot of vito.screenshots ?? []) files.push(shot);
  return files;
}

export function resolveInside(baseDir, relative) {
  const resolved = path.resolve(baseDir, relative);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  const inside = resolved === path.resolve(baseDir) || resolved.startsWith(normalizedBase);
  return { resolved, inside };
}

// CLI helper: explicit slugs from argv (non-flag args), else all plugins.
export function targetsFromArgv(argv) {
  const explicit = argv.filter((arg) => !arg.startsWith("-"));
  return explicit.length > 0 ? explicit : listPluginSlugs();
}

export function isMainModule(metaUrl) {
  return process.argv[1] === fileURLToPath(metaUrl);
}
