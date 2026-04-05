const {
  withInfoPlist,
  withAndroidManifest,
} = require("@expo/config-plugins");

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

  return config;
}

module.exports = withSpotifyAppRemote;
