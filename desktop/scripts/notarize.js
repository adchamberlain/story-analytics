// desktop/scripts/notarize.js
"use strict";

// This script runs automatically after electron-builder signs the app.
// It submits the signed app to Apple's notarization service.
// Set these env vars before running the dist build:
//   APPLE_ID          — your Apple ID email
//   APPLE_TEAM_ID     — your 10-character Team ID (from developer.apple.com)
//   APPLE_APP_SPECIFIC_PASSWORD — app-specific password (from appleid.apple.com)

const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== "darwin") return;

  // Skip notarization if credentials not set (e.g. unsigned local test build)
  if (!process.env.APPLE_ID) {
    console.log("[notarize] APPLE_ID not set — skipping notarization");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath} to Apple notarization...`);

  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Notarization timed out after 30 minutes")), TIMEOUT_MS)
  );

  try {
    await Promise.race([
      notarize({
        tool: "notarytool",
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      }),
      timeout,
    ]);
    console.log("[notarize] Notarization complete");
  } catch (err) {
    // If Apple's service is down/slow, log a warning but don't fail the build.
    // Run `xcrun stapler staple` on the DMG once the submission is processed.
    console.warn(`[notarize] WARNING: Notarization did not complete: ${err.message}`);
    console.warn("[notarize] The app is signed but not yet notarized. Check submission status with:");
    console.warn("[notarize]   xcrun notarytool history --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password $APPLE_APP_SPECIFIC_PASSWORD");
    console.warn("[notarize] Once Accepted, staple with: xcrun stapler staple 'Story Analytics-*.dmg'");
  }
};
