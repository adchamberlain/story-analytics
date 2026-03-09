// desktop/scripts/notarize.js
"use strict";

// Runs automatically after electron-builder signs the app.
// 1. Signs all PyInstaller .dylib/.so files (codesign --deep misses these).
// 2. Re-signs the app bundle to update its seal.
// 3. Submits to Apple notarization and polls for result.
//
// Required env vars:
//   APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD
//
// NOTE: notarytool 1.1.0 on macOS 26.x beta has a crash bug (SIGBUS / infinite
// recursion in its NIO network channel) that fires AFTER the upload succeeds.
// The submission IS created in Apple's history even though the tool crashes.
// We work around this by catching the crash, finding the new submission by
// timestamp in Apple's history, and polling it manually.

const { notarize } = require("@electron/notarize");
const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function authArgs() {
  return [
    "--apple-id", process.env.APPLE_ID,
    "--team-id", process.env.APPLE_TEAM_ID,
    "--password", process.env.APPLE_APP_SPECIFIC_PASSWORD,
  ];
}

function runNotarytool(args) {
  const result = spawnSync("xcrun", ["notarytool", ...args, "--output-format", "json"], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  const raw = ((result.stdout || "") + (result.stderr || "")).trim();
  try {
    return { code: result.status, data: JSON.parse(raw), raw };
  } catch {
    return { code: result.status, data: null, raw };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const entitlements = path.join(__dirname, "../assets/entitlements.mac.plist");

  // ── Step 1: Sign PyInstaller binaries ──────────────────────────────────────
  // electron-builder's codesign --deep does NOT recurse into Resources/
  // subdirectories for .dylib/.so files. Apple rejects bundles with unsigned libs.
  const apiServerDir = path.join(appPath, "Contents/Resources/api-server");
  if (fs.existsSync(apiServerDir)) {
    console.log("[notarize] Signing PyInstaller binaries (required for notarization)...");

    const identity = execSync(
      "security find-identity -v -p codesigning | grep 'Developer ID Application' | head -1 | awk '{print $2}'"
    ).toString().trim();

    if (!identity) {
      console.warn("[notarize] No Developer ID Application cert found — skipping binary re-signing");
    } else {
      const raw = execSync(
        `find "${apiServerDir}" -type f \\( -name "*.dylib" -o -name "*.so" \\)`
      ).toString().trim();
      const binaries = raw ? raw.split("\n").filter(Boolean) : [];

      console.log(`[notarize]   Signing ${binaries.length} libraries...`);
      let signed = 0, failed = 0;
      for (const f of binaries) {
        try {
          execSync(
            `codesign --force --sign "${identity}" --options runtime --entitlements "${entitlements}" "${f}"`,
            { stdio: "pipe" }
          );
          signed++;
        } catch (e) {
          console.warn(`[notarize]   WARN: ${path.basename(f)}: ${e.stderr?.toString().trim()}`);
          failed++;
        }
      }
      console.log(`[notarize]   Signed ${signed} libraries (${failed} skipped).`);

      console.log("[notarize]   Re-signing app bundle...");
      execSync(
        `codesign --force --sign "${identity}" --options runtime --entitlements "${entitlements}" "${appPath}"`,
        { stdio: "pipe" }
      );
      console.log("[notarize] Re-signing complete.");
    }
  }

  // ── Step 2: Notarize ────────────────────────────────────────────────────────
  if (!process.env.APPLE_ID) {
    console.log("[notarize] APPLE_ID not set — skipping notarization");
    return;
  }

  // Record the time just before submitting so we can find the new submission ID
  // even if notarytool crashes after uploading (macOS 26.x beta bug).
  const submitStart = new Date();
  console.log(`[notarize] Submitting ${appPath} to Apple notarization...`);

  let submissionId = null;

  try {
    // @electron/notarize uses ditto to zip the .app, then runs:
    //   xcrun notarytool submit <zip> --wait
    // On macOS 26.x, notarytool crashes AFTER the upload with SIGBUS (infinite
    // recursion in NIO). The submission IS created; we catch and recover below.
    await notarize({
      tool: "notarytool",
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log("[notarize] Notarization complete.");
    return;
  } catch (err) {
    console.log(`[notarize] notarytool exited early: ${err.message}`);
    console.log("[notarize] Checking Apple history for a new submission created by this run...");
  }

  // Give Apple a moment to register the submission
  await sleep(5_000);

  // Find the submission created by this run (within the last 2 minutes)
  const { data: history } = runNotarytool(["history", ...authArgs()]);
  if (history && history.history) {
    for (const entry of history.history) {
      const created = new Date(entry.createdDate);
      // Accept submissions created within 2 minutes of our submit start
      if (created >= new Date(submitStart.getTime() - 10_000) &&
          created <= new Date(submitStart.getTime() + 120_000)) {
        submissionId = entry.id;
        console.log(`[notarize] Found submission from this run: ${submissionId} (created ${entry.createdDate})`);
        break;
      }
    }
  }

  if (!submissionId) {
    console.warn("[notarize] WARNING: Could not find a submission for this run in Apple's history.");
    console.warn("[notarize] The upload may have failed. Check history manually:");
    console.warn("[notarize]   xcrun notarytool history --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password $APPLE_APP_SPECIFIC_PASSWORD");
    return;
  }

  // ── Step 3: Poll until complete ────────────────────────────────────────────
  console.log("[notarize] Polling Apple for result (every 30s, up to 30 minutes)...");
  const POLL_INTERVAL_MS = 30_000;
  const MAX_POLLS = 60; // 30 minutes

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const { data: info } = runNotarytool(["info", submissionId, ...authArgs()]);
    const elapsed = ((i + 1) * POLL_INTERVAL_MS / 60_000).toFixed(1);

    if (!info) {
      console.log(`[notarize]   (${elapsed}m) Could not parse status — retrying...`);
      continue;
    }

    console.log(`[notarize]   (${elapsed}m) Status: ${info.status}`);

    if (info.status === "Accepted") {
      console.log("[notarize] Notarization complete!");
      return;
    }

    if (info.status === "Invalid") {
      const { raw: logRaw } = runNotarytool(["log", submissionId, ...authArgs()]);
      console.error("[notarize] REJECTED by Apple. Notarization log:");
      console.error(logRaw);
      throw new Error("Notarization rejected by Apple. See log above for details.");
    }

    // "In Progress" — keep polling
  }

  console.warn(`[notarize] WARNING: Notarization did not complete within 30 minutes.`);
  console.warn(`[notarize] Submission ID: ${submissionId}`);
  console.warn("[notarize] Once Apple processes it, staple the ticket:");
  console.warn("[notarize]   xcrun stapler staple 'desktop/dist/Story Analytics-*.dmg'");
};
