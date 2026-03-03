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

  await notarize({
    tool: "notarytool",
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log("[notarize] Notarization complete");
};
