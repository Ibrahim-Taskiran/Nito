// Fails when a shipped npm package or any Rust crate has a licence outside the allow list (ROADMAP: permissive only).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set([
  "MIT", "MIT-0", "Apache-2.0", "Apache-2.0 WITH LLVM-exception", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "ISC", "Zlib",
  "MPL-2.0", "OFL-1.1", "Unlicense", "CC0-1.0", "BSL-1.0", "Unicode-3.0", "Unicode-DFS-2016",
]);
// Packages with no licence field, checked by hand.
const KNOWN = { "nito": "own code", "nito_lib": "own code" };

/** SPDX expression check: every AND part must be allowed, one OR alternative is enough. */
function allowed(expr) {
  const e = expr.replace(/[()]/g, " ").replace(/\//g, " OR ").trim();
  return e.split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every((p) => ALLOWED.has(p.trim())));
}

const bad = [];
const check = (eco, name, version, license) => {
  if (KNOWN[name]) return;
  if (!license || !allowed(license)) bad.push(`${eco} ${name}@${version}: ${license ?? "no licence"}`);
};

// npm: production dependency tree only (dev tools are not shipped).
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, shell: process.platform === "win32" });
const tree = JSON.parse(sh("npm", ["ls", "--omit=dev", "--all", "--json"]));
const seen = new Set();
(function walk(deps = {}) {
  for (const [name, d] of Object.entries(deps)) {
    if (seen.has(name)) continue;
    const file = join("node_modules", name, "package.json");
    if (!existsSync(file)) continue; // optional package for another platform, not installed
    seen.add(name);
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    check("npm", name, pkg.version, lic);
    walk(d.dependencies);
  }
})(tree.dependencies);

// cargo: every crate in the lock graph.
const meta = JSON.parse(sh("cargo", ["metadata", "--format-version", "1", "--manifest-path", "src-tauri/Cargo.toml"]));
for (const p of meta.packages) check("cargo", p.name, p.version, p.license);

console.log(`npm packages: ${seen.size}, crates: ${meta.packages.length}`);
if (bad.length) {
  console.error(`Not allowed (${bad.length}):\n${bad.join("\n")}`);
  process.exit(1);
}
console.log("All licences allowed.");
