/**
 * version-bump.js
 * Auto-increments version (#NNN), updates window.VIZINT_VERSION,
 * and appends new commits to window.VIZINT_HISTORY in history.js.
 */

const fs = require("fs");
const { execSync } = require("child_process");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
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
    /(window\.VIZINT_VERSION\s*=\s*'\$VER:\s*#)\d+(\+?';?)/,
    `$1${nextNum}$2`
  );

  // 5️⃣ Insert new HISTORY entry
  const entry = {
    ver: verLabel,
    title: commits[0],
    bullets: commits,
    status: "Auto-generated"
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

  // 7️⃣ Commit
  run("git add lib/history.js");
  run(`git commit -m "Auto: version bump to ${verLabel}"`);
  console.log("✅ Changes committed");

  console.log("\n🚀 Done! Push with:\n  git push && git push --tags\n");

} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
