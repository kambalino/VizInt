/**
 * version-bump.js
 * Auto-increments version (#NNN), updates window.VIZINT_VERSION,
 * and appends new commits to window.VIZINT_HISTORY in history.js.
 */

const { execSync, spawnSync } = require("child_process");

const fs = require("fs");
const { execSync } = require("child_process");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Escape quotes and backslashes so commit messages stay valid JS strings
function safeString(str) {
  return str
    .replace(/\\/g, '\\\\')   // backslashes first
    .replace(/'/g, "\\'")     // single quotes
    .replace(/\r?\n/g, ' ');  // remove line breaks
}

try {
  // 1️⃣ Find the last tag matching ver-*
  let lastTag = "";
  try {
    lastTag = run("git describe --tags --match 'ver-*' --abbrev=0");
  } catch {
    console.log("No previous version tag found. Starting fresh at #000.");
  }

  // 2️⃣ Determine new commits since last tag
  const logRange = lastTag ? `${lastTag}..HEAD` : "";
  const commits = run(`git log ${logRange} --pretty=%s`).split("\n").filter(Boolean);
  if (!commits.length) {
    console.log("⚠️ No new commits since last tag. Nothing to version.");
    process.exit(0);
  }

  // 3️⃣ Compute next version number
  const lastNum = lastTag ? parseInt(lastTag.replace("ver-", ""), 10) : 0;
  const nextNum = String(lastNum + 1).padStart(3, "0");
  const verTag = `ver-${nextNum}`;
  const verLabel = `#${nextNum}`;
  console.log(`📦 Preparing ${verLabel} (${verTag})`);

  const histFile = "lib/history.js";
  if (!fs.existsSync(histFile)) throw new Error(`Missing ${histFile}`);

  let hist = fs.readFileSync(histFile, "utf8");

  // 4️⃣ Update $VER line
  hist = hist.replace(
    /(window\.VIZINT_VERSION\s*=\s*'\$VER:\s*#)[0-9]+[^\n']*(';?)/
    `$1${nextNum}$2`
  );

  // 5️⃣ Insert new HISTORY entry
  const entry = {
	ver: verLabel,
	title: safeString(commits[0]),
	bullets: commits.map(safeString),
	status: 'Auto-generated'
  };

  const insertBlock = JSON.stringify(entry, null, 2)
    .replace(/"(\w+)":/g, "$1:")
    .replace(/"([^"]+)"/g, "'$1'");

  hist = hist.replace(/(window\.VIZINT_HISTORY\s*=\s*\[)/, `$1\n  ${insertBlock},`);

  fs.writeFileSync(histFile, hist);
  console.log("✅ lib/history.js updated");

  // 6️⃣ Tag this commit
  run(`git tag ${verTag}`);
  console.log(`🏷️ Tag created: ${verTag}`);

  // 7️⃣ Stage & commit safely
	console.log("🟢 Performing safe Git commit inside VS Code...");

	spawnSync("git", ["add", "lib/history.js"], { stdio: "inherit" });
	spawnSync("git", ["commit", "-m", `Auto: version bump to ${verLabel}`], { stdio: "inherit" });

	// small delay so VS Code Git watcher can re-index
	await new Promise(r => setTimeout(r, 1000));

	console.log("✅ Safe commit complete — VS Code should pick this up automatically.");

} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
