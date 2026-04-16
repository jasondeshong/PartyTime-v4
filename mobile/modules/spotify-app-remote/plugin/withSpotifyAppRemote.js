const {
  withInfoPlist,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function withSpotifyAppRemote(config) {
  // iOS: Add spotify to LSApplicationQueriesSchemes
  config = withInfoPlist(config, (config) => {
    const existing = config.modResults.LSApplicationQueriesSchemes || [];
    if (!existing.includes("spotify")) {
      config.modResults.LSApplicationQueriesSchemes = [...existing, "spotify"];
    }
    return config;
  });

  // Android: Add <queries> for Spotify package
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) manifest.queries = [];

    const hasSpotify = manifest.queries.some(
      (q) =>
        q.package &&
        q.package.some(
          (p) => p.$ && p.$["android:name"] === "com.spotify.music"
        )
    );

    if (!hasSpotify) {
      manifest.queries.push({
        package: [{ $: { "android:name": "com.spotify.music" } }],
      });
    }

    return config;
  });

  // iOS: Download SpotifyiOS.xcframework from GitHub if missing
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const iosDir = path.resolve(
        config.modRequest.projectRoot,
        "modules/spotify-app-remote/ios"
      );
      const xcfwDir = path.join(iosDir, "SpotifyiOS.xcframework");

      if (!fs.existsSync(xcfwDir)) {
        console.log("[SpotifyAppRemote] Downloading SpotifyiOS.xcframework...");
        const tmpDir = path.join(iosDir, "_spotify_tmp");
        try {
          execSync(
            `git clone --depth 1 --filter=blob:none --sparse "https://github.com/nicolo-ribaudo/ios-sdk.git" "${tmpDir}"`,
            { stdio: "pipe" }
          );
          execSync("git sparse-checkout set SpotifyiOS.xcframework", {
            cwd: tmpDir,
            stdio: "pipe",
          });
          fs.renameSync(path.join(tmpDir, "SpotifyiOS.xcframework"), xcfwDir);
          console.log("[SpotifyAppRemote] SpotifyiOS.xcframework ready.");
        } catch (e) {
          console.error(
            "[SpotifyAppRemote] Failed to download SpotifyiOS.xcframework:",
            e.message
          );
          throw e;
        } finally {
          if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
        }
      } else {
        console.log("[SpotifyAppRemote] SpotifyiOS.xcframework already present.");
      }
      return config;
    },
  ]);

  // Android: Download Spotify App Remote AAR if missing
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const androidDir = path.resolve(
        config.modRequest.projectRoot,
        "modules/spotify-app-remote/android"
      );
      const libsDir = path.join(androidDir, "libs");
      const aarPath = path.join(libsDir, "spotify-app-remote-release-0.8.0.aar");

      if (!fs.existsSync(aarPath)) {
        console.log("[SpotifyAppRemote] Downloading Spotify Android AAR...");
        if (!fs.existsSync(libsDir)) fs.mkdirSync(libsDir, { recursive: true });
        try {
          execSync(
            `curl -L -o "${aarPath}" "https://github.com/nicolo-ribaudo/android-sdk/releases/download/v0.8.0-appremote_v2.1.0-auth/spotify-app-remote-release-0.8.0.aar"`,
            { stdio: "pipe" }
          );
          console.log("[SpotifyAppRemote] Spotify Android AAR ready.");
        } catch (e) {
          console.error(
            "[SpotifyAppRemote] Failed to download Android AAR:",
            e.message
          );
          throw e;
        }
      } else {
        console.log("[SpotifyAppRemote] Spotify Android AAR already present.");
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withSpotifyAppRemote;
