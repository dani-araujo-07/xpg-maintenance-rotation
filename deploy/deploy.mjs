import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const buildRoot = join(root, ".build");
const clasp = join(root, "node_modules", ".bin", "clasp");

const USAGE = `Usage: npm run deploy -- <team...> | --all [--dry-run] [--allow-dirty]

  <team...>      one or more keys from deploy/teams.json
  --all          every team in deploy/teams.json
  --dry-run      build and list the files that would be pushed, without pushing
  --allow-dirty  deploy even with uncommitted changes in src/ or deploy/`;

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith("--")));
  const names = args.filter(a => !a.startsWith("--"));
  const unknownFlags = [...flags].filter(f => !["--all", "--dry-run", "--allow-dirty", "--help"].includes(f));

  if (flags.has("--help") || unknownFlags.length || (!names.length && !flags.has("--all")) || (names.length && flags.has("--all"))) {
    if (unknownFlags.length) console.error(`Unknown option: ${unknownFlags.join(", ")}\n`);
    console.log(USAGE);
    process.exit(flags.has("--help") ? 0 : 1);
  }

  const teams = JSON.parse(readFileSync(join(root, "deploy", "teams.json"), "utf8"));
  const selected = flags.has("--all") ? Object.keys(teams) : names;
  const unknownTeams = selected.filter(name => !teams[name]);
  if (unknownTeams.length) {
    fail(`Unknown team(s): ${unknownTeams.join(", ")}. Known: ${Object.keys(teams).join(", ")}`);
  }
  selected.forEach(name => validateTeam(name, teams[name]));

  const dirty = git("status", "--porcelain", "--", "src", "deploy");
  if (dirty && !flags.has("--allow-dirty")) {
    fail(`Uncommitted changes in src/ or deploy/ - commit them first, or pass --allow-dirty:\n${dirty}`);
  }

  const version = {
    commit: git("rev-parse", "--short", "HEAD") + (dirty ? "-dirty" : ""),
    deployedAt: new Date().toISOString(),
    deployedBy: git("config", "user.email") || "unknown"
  };

  const failures = [];
  for (const name of selected) {
    const team = teams[name];
    console.log(`\n▶ ${team.name} (${name}) - ${version.commit}, ${team.timeZone}`);
    try {
      const buildDir = build(name, team, version);
      if (flags.has("--dry-run")) {
        console.log(run(clasp, ["status"], buildDir));
        console.log(`  dry run - nothing pushed. Build is in ${buildDir}`);
      } else {
        run(clasp, ["push", "--force"], buildDir, true);
        console.log(`  ✓ deployed`);
      }
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failures.push(name);
    }
  }

  if (failures.length) fail(`\nFailed: ${failures.join(", ")}`);
  console.log(`\n✓ ${flags.has("--dry-run") ? "Built" : "Deployed"} ${selected.length} team(s)`);
}

function validateTeam(name, team) {
  if (!team.name || !team.scriptId || !team.timeZone) {
    fail(`Team "${name}" in deploy/teams.json needs name, scriptId and timeZone`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: team.timeZone });
  } catch {
    fail(`Team "${name}" has an invalid timeZone "${team.timeZone}" (use an IANA name like Europe/Berlin)`);
  }
}

function build(name, team, version) {
  const buildDir = join(buildRoot, name);
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  for (const file of readdirSync(srcDir)) {
    if (file.endsWith(".js") || file === "appsscript.json") cpSync(join(srcDir, file), join(buildDir, file));
  }

  const manifestPath = join(buildDir, "appsscript.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.timeZone = team.timeZone;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const deployment = { ...version, team: team.name };
  writeFileSync(join(buildDir, "Version.js"), `const DEPLOYMENT = ${JSON.stringify(deployment, null, 2)};\n`);

  writeFileSync(join(buildDir, ".clasp.json"), JSON.stringify({ scriptId: team.scriptId, rootDir: "." }, null, 2) + "\n");
  writeFileSync(join(buildDir, ".claspignore"), "**/**\n!*.js\n!appsscript.json\n");

  return buildDir;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function run(command, args, cwd, inherit = false) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: inherit ? "inherit" : "pipe" });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
