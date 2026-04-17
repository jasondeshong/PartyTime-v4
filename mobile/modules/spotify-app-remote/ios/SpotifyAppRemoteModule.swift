import ExpoModulesCore
import SpotifyiOS

fileprivate let CLIENT_ID = "18f1b52ab93b4c6480b1599b64d9be5b"
fileprivate let REDIRECT_URI = "partytime://callback"

final class SpotifyRemoteManager: NSObject, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
  static let shared = SpotifyRemoteManager()

  private(set) var appRemote: SPTAppRemote?
  private var config: SPTConfiguration?
  var connectPromise: Promise?
  var isSubscribed = false
  var appRemoteToken: String?

  var onConnectionChanged: (([String: Any]) -> Void)?
  var onPlayerStateChanged: (([String: Any]) -> Void)?

  private override init() { super.init() }

  func setupIfNeeded(accessToken: String) {
    if config == nil {
      config = SPTConfiguration(clientID: CLIENT_ID, redirectURL: URL(string: REDIRECT_URI)!)
      config!.playURI = ""
    }
    if appRemote == nil {
      appRemote = SPTAppRemote(configuration: config!, logLevel: .debug)
      appRemote!.delegate = self
    }
    appRemote!.connectionParameters.accessToken = accessToken
  }

  func connectOnMainThread() {
    DispatchQueue.main.async { [weak self] in
      self?.appRemote?.connect()
    }
  }

  func disconnectCleanly() {
    appRemote?.delegate = nil
    appRemote?.disconnect()
    appRemote = nil
    config = nil
    isSubscribed = false
  }

  // Called from AppDelegate — runs synchronously on main thread within
  // the iOS URL handler, which is the only window where SPTAppRemote
  // IPC can complete the authorization handshake.
  func handleOpenURL(_ url: URL) -> Bool {
    guard let appRemote = appRemote else { return false }

    let params = appRemote.authorizationParameters(from: url)

    if let token = params?[SPTAppRemoteAccessTokenKey] as? String {
      NSLog("[SpotifyRemote] App Remote token extracted (%d chars)", token.count)
      appRemoteToken = token
      // Set token on the SAME instance and connect immediately
      appRemote.connectionParameters.accessToken = token
      appRemote.connect()
      return true
    } else if let errorDesc = params?[SPTAppRemoteErrorDescriptionKey] as? String {
      NSLog("[SpotifyRemote] Auth error from Spotify: %@", errorDesc)
      connectPromise?.reject("AUTH_ERROR", errorDesc)
      connectPromise = nil
      return true
    }

    return false
  }

  // MARK: - SPTAppRemoteDelegate

  func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    NSLog("[SpotifyRemote] Connection established!")
    connectPromise?.resolve(nil)
    connectPromise = nil
    onConnectionChanged?(["connected": true])
  }

  func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    let msg = error?.localizedDescription ?? "Connection failed"
    NSLog("[SpotifyRemote] Connection failed: %@", msg)
    connectPromise?.reject("CONNECTION_FAILED", msg)
    connectPromise = nil
    onConnectionChanged?(["connected": false, "error": msg])
  }

  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    NSLog("[SpotifyRemote] Disconnected: %@", error?.localizedDescription ?? "no error")
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

public class SpotifyAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return SpotifyRemoteManager.shared.handleOpenURL(url)
  }
}

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

      // Cancel any in-progress attempt
      if let old = self.manager.connectPromise {
        self.manager.connectPromise = nil
        old.reject("CANCELLED", "Superseded by new connect attempt")
      }

      self.manager.setupIfNeeded(accessToken: accessToken)
      self.manager.connectPromise = promise
      self.manager.connectOnMainThread()

      // Timeout — also disconnect to avoid stale IPC
      DispatchQueue.main.asyncAfter(deadline: .now() + 6.0) {
        if let p = self.manager.connectPromise {
          self.manager.connectPromise = nil
          self.manager.appRemote?.disconnect()
          p.reject("CONNECT_TIMEOUT", "Spotify connect timed out — is Spotify open?")
        }
      }
    }

    AsyncFunction("authorize") { (uri: String, promise: Promise) in
      guard let appRemote = self.manager.appRemote else {
        promise.reject("NOT_INITIALIZED", "Call connect first")
        return
      }

      // Cancel any in-progress attempt
      if let old = self.manager.connectPromise {
        self.manager.connectPromise = nil
        old.reject("CANCELLED", "Superseded by authorize")
      }

      // authorize resolves when the AppDelegate catches the redirect
      // and handleOpenURL() → connect() → delegate fires
      self.manager.connectPromise = promise
      DispatchQueue.main.async {
        appRemote.authorizeAndPlayURI(uri.isEmpty ? "" : uri)
      }
    }

    AsyncFunction("handleAuthURL") { (urlString: String, promise: Promise) in
      guard let url = URL(string: urlString) else {
        promise.resolve(false)
        return
      }
      let handled = self.manager.handleOpenURL(url)
      promise.resolve(handled)
    }

    AsyncFunction("disconnect") { (promise: Promise) in
      self.manager.disconnectCleanly()
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
