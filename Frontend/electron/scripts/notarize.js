/**
 * macOS Notarization — afterSign hook for electron-builder.
 *
 * This script runs automatically after code-signing on macOS CI builds.
 * It submits the signed .app to Apple's notarization service and staples
 * the ticket so users don't see Gatekeeper warnings.
 *
 * Required environment variables (set via GitHub Secrets):
 *   APPLE_ID                    — Your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD — App-specific password from appleid.apple.com
 *   APPLE_TEAM_ID               — 10-character Apple Developer Team ID
 */

const { notarize } = require("@electron/notarize");
const path = require("path");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== "darwin") {
    console.log("Skipping notarization — not a macOS build.");
    return;
  }

  // Skip if credentials are not set (local dev builds)
  if (
    !process.env.APPLE_ID ||
    !process.env.APPLE_APP_SPECIFIC_PASSWORD ||
    !process.env.APPLE_TEAM_ID
  ) {
    console.log(
      "Skipping notarization — Apple credentials not found in environment."
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath} ...`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log("Notarization complete.");
};
