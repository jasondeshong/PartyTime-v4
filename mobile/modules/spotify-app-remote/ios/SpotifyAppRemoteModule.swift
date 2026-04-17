import ExpoModulesCore
import SpotifyiOS

fileprivate let CLIENT_ID = "18f1b52ab93b4c6480b1599b64d9be5b"
fileprivate let REDIRECT_URI = "partytime://callback"

// Singleton so the AppDelegate subscriber can access the same instance
final class SpotifyRemoteManager: NSObject, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
  static let shared = SpotifyRemoteManager()

  var appRemote: SPTAppRemote?
  var config: SPTConfiguration?
  var connectPromise: Promise?
  var isSubscribed = false

  // Event forwarding — set by the Module
  var onConnectionChanged: (([String: Any]) -> Void)?
  var onPlayerStateChanged: (([String: Any]) -> Void)?

  private override init() { super.init() }

  func createAndConnect(accessToken: String) {
    if let old = appRemote { old.disconnect() }
    config = SPTConfiguration(clientID: CLIENT_ID, redirectURL: URL(string: REDIRECT_URI)!)
    config!.playURI = ""
    appRemote = SPTAppRemote(configuration: config!, logLevel: .debug)
    appRemote!.delegate = self
    appRemote!.connectionParameters.accessToken = accessToken
    appRemote!.connect()
  }

  // Called immediately from AppDelegate when Spotify redirects back
  func handleOpenURL(_ url: URL) -> Bool {
    guard let appRemote = appRemote else { return false }
    let params = appRemote.authorizationParameters(from: url)
    if let token = params?[SPTAppRemoteAccessTokenKey] as? String {
      // Fresh instance — the old one has stale IPC state from the failed connect
      createAndConnect(accessToken: token)
      return true
    }
    return false
  }

  // MARK: - SPTAppRemoteDelegate

  func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    connectPromise?.resolve(nil)
    connectPromise = nil
    onConnectionChanged?(["connected": true])
  }

  func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    let msg = error?.localizedDescription ?? "Connection failed"
    connectPromise?.reject("CONNECTION_FAILED", msg)
    connectPromise = nil
    onConnectionChanged?(["connected": false, "error": msg])
  }

  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    onConnectionChanged?(["connected": false, "error": error?.localizedDescription ?? ""])
  }

  // MARK: - SPTAppRemotePlayerStateDelegate

  func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
    onPlayerStateChanged?(stateToDict(playerState))
  }

  func stateToDict(_ state: SPTAppRemotePlayerState) -> [String: Any] {
    return [
      "uri": state.track.uri,
      "trackName": state.track.name,
      "artistName": state.track.artist.name,
      "albumName": state.track.album.name,
      "durationMs": state.track.duration,
      "positionMs": state.playbackPosition,
      "isPaused": state.isPaused,
    ]
  }
}

// AppDelegate subscriber — handles Spotify redirect URLs immediately
// at the native level before JS even sees them. This is critical because
// SPTAppRemote's IPC window closes if connect() isn't called synchronously
// from the URL handler.
public class SpotifyAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return SpotifyRemoteManager.shared.handleOpenURL(url)
  }
}

// Expo Module — thin wrapper that delegates to the singleton
public class SpotifyAppRemoteModule: Module {
  private let manager = SpotifyRemoteManager.shared

  public func definition() -> ModuleDefinition {
    Name("ExpoSpotifyAppRemote")

    Events("onPlayerStateChanged", "onConnectionChanged")

    OnStartObserving {
      self.manager.onConnectionChanged = { [weak self] data in
        self?.sendEvent("onConnectionChanged", data)
      }
      self.manager.onPlayerStateChanged = { [weak self] data in
        self?.sendEvent("onPlayerStateChanged", data)
      }
    }

    OnStopObserving {
      self.manager.onConnectionChanged = nil
      self.manager.onPlayerStateChanged = nil
    }

    AsyncFunction("connect") { (accessToken: String, promise: Promise) in
      if let url = URL(string: "spotify:"), !UIApplication.shared.canOpenURL(url) {
        promise.reject("SPOTIFY_NOT_INSTALLED", "Spotify app is not installed")
        return
      }

      self.manager.connectPromise = promise
      self.manager.createAndConnect(accessToken: accessToken)

      DispatchQueue.main.asyncAfter(deadline: .now() + 6.0) {
        if let p = self.manager.connectPromise {
          self.manager.connectPromise = nil
          p.reject("CONNECT_TIMEOUT", "Spotify connect timed out — is Spotify open?")
        }
      }
    }

    AsyncFunction("authorize") { (uri: String, promise: Promise) in
      guard let appRemote = self.manager.appRemote else {
        promise.reject("NOT_INITIALIZED", "Call connect first")
        return
      }
      self.manager.connectPromise = promise
      appRemote.authorizeAndPlayURI(uri.isEmpty ? "" : uri)
    }

    AsyncFunction("handleAuthURL") { (urlString: String, promise: Promise) in
      guard let url = URL(string: urlString) else {
        promise.resolve(false)
        return
      }
      let handled = self.manager.handleOpenURL(url)
      if handled {
        self.manager.connectPromise = promise
      } else {
        promise.resolve(false)
      }
    }

    AsyncFunction("disconnect") { (promise: Promise) in
      self.manager.appRemote?.disconnect()
      self.manager.appRemote = nil
      self.manager.config = nil
      self.manager.isSubscribed = false
      promise.resolve(nil)
    }

    AsyncFunction("play") { (uri: String, promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.play(uri) { _, error in
        if let error = error {
          promise.reject("PLAY_ERROR", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("pause") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.pause { _, error in
        if let error = error {
          promise.reject("PAUSE_ERROR", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("resume") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.resume { _, error in
        if let error = error {
          promise.reject("RESUME_ERROR", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("seekTo") { (positionMs: Int, promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.seek(toPosition: positionMs) { _, error in
        if let error = error {
          promise.reject("SEEK_ERROR", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("skipToNext") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.skip(toNext: { _, error in
        if let error = error {
          promise.reject("SKIP_ERROR", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      })
    }

    AsyncFunction("getPlayerState") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.getPlayerState { result, error in
        if let error = error {
          promise.reject("STATE_ERROR", error.localizedDescription)
          return
        }
        guard let state = result as? SPTAppRemotePlayerState else {
          promise.reject("STATE_ERROR", "Invalid player state")
          return
        }
        promise.resolve(self.manager.stateToDict(state))
      }
    }

    AsyncFunction("subscribeToPlayerState") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.delegate = self.manager
      playerAPI.subscribe(toPlayerState: { _, error in
        if let error = error {
          promise.reject("SUBSCRIBE_ERROR", error.localizedDescription)
        } else {
          self.manager.isSubscribed = true
          promise.resolve(nil)
        }
      })
    }

    AsyncFunction("unsubscribeFromPlayerState") { (promise: Promise) in
      guard let playerAPI = self.manager.appRemote?.playerAPI else {
        promise.resolve(nil)
        return
      }
      playerAPI.unsubscribe(toPlayerState: { _, error in
        self.manager.isSubscribed = false
        promise.resolve(nil)
      })
    }
  }
}
