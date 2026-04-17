import ExpoModulesCore
import SpotifyiOS

fileprivate let CLIENT_ID = "18f1b52ab93b4c6480b1599b64d9be5b"
fileprivate let REDIRECT_URI = "partytime://callback"

public class SpotifyAppRemoteModule: Module {
  fileprivate var config: SPTConfiguration?
  fileprivate var appRemote: SPTAppRemote?
  fileprivate var delegateHandler: SpotifyDelegateHandler?
  fileprivate var connectPromise: Promise?
  fileprivate var isSubscribed = false

  fileprivate func createAppRemote(accessToken: String) {
    // Always destroy previous instance to avoid stale IPC state
    if let old = appRemote { old.disconnect() }
    config = SPTConfiguration(clientID: CLIENT_ID, redirectURL: URL(string: REDIRECT_URI)!)
    config!.playURI = ""
    appRemote = SPTAppRemote(configuration: config!, logLevel: .debug)
    delegateHandler = SpotifyDelegateHandler(module: self)
    appRemote!.delegate = delegateHandler
    appRemote!.connectionParameters.accessToken = accessToken
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoSpotifyAppRemote")

    Events("onPlayerStateChanged", "onConnectionChanged")

    AsyncFunction("connect") { (accessToken: String, promise: Promise) in
      // Check Spotify is installed
      if let url = URL(string: "spotify:"), !UIApplication.shared.canOpenURL(url) {
        promise.reject("SPOTIFY_NOT_INSTALLED", "Spotify app is not installed")
        return
      }

      self.createAppRemote(accessToken: accessToken)
      self.connectPromise = promise

      self.appRemote!.connect()

      // 6-second timeout — SPTAppRemote can hang silently
      DispatchQueue.main.asyncAfter(deadline: .now() + 6.0) {
        if let p = self.connectPromise {
          self.connectPromise = nil
          p.reject("CONNECT_TIMEOUT", "Spotify connect timed out — is Spotify open?")
        }
      }
    }

    AsyncFunction("authorize") { (uri: String, promise: Promise) in
      guard let appRemote = self.appRemote else {
        promise.reject("NOT_INITIALIZED", "Call connect first to initialize App Remote")
        return
      }
      self.connectPromise = promise
      appRemote.authorizeAndPlayURI(uri.isEmpty ? "" : uri)
    }

    AsyncFunction("handleAuthURL") { (urlString: String, promise: Promise) in
      guard let url = URL(string: urlString),
            let appRemote = self.appRemote else {
        promise.resolve(false)
        return
      }
      let params = appRemote.authorizationParameters(from: url)
      if let token = params?[SPTAppRemoteAccessTokenKey] as? String {
        appRemote.connectionParameters.accessToken = token
        self.connectPromise = promise
        appRemote.connect()
      } else if let errorDesc = params?[SPTAppRemoteErrorDescriptionKey] as? String {
        promise.reject("AUTH_ERROR", errorDesc)
      } else {
        promise.resolve(false)
      }
    }

    AsyncFunction("disconnect") { (promise: Promise) in
      self.appRemote?.disconnect()
      self.appRemote = nil
      self.config = nil
      self.delegateHandler = nil
      self.isSubscribed = false
      promise.resolve(nil)
    }

    AsyncFunction("play") { (uri: String, promise: Promise) in
      guard let playerAPI = self.appRemote?.playerAPI else {
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
      guard let playerAPI = self.appRemote?.playerAPI else {
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
      guard let playerAPI = self.appRemote?.playerAPI else {
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
      guard let playerAPI = self.appRemote?.playerAPI else {
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
      guard let playerAPI = self.appRemote?.playerAPI else {
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
      guard let playerAPI = self.appRemote?.playerAPI else {
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
        promise.resolve(self.stateToDict(state))
      }
    }

    AsyncFunction("subscribeToPlayerState") { (promise: Promise) in
      guard let playerAPI = self.appRemote?.playerAPI else {
        promise.reject("NOT_CONNECTED", "Not connected to Spotify")
        return
      }
      playerAPI.delegate = self.delegateHandler
      playerAPI.subscribe(toPlayerState: { _, error in
        if let error = error {
          promise.reject("SUBSCRIBE_ERROR", error.localizedDescription)
        } else {
          self.isSubscribed = true
          promise.resolve(nil)
        }
      })
    }

    AsyncFunction("unsubscribeFromPlayerState") { (promise: Promise) in
      guard let playerAPI = self.appRemote?.playerAPI else {
        promise.resolve(nil)
        return
      }
      playerAPI.unsubscribe(toPlayerState: { _, error in
        self.isSubscribed = false
        promise.resolve(nil)
      })
    }
  }

  fileprivate func stateToDict(_ state: SPTAppRemotePlayerState) -> [String: Any] {
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

  fileprivate func handleConnect() {
    connectPromise?.resolve(nil)
    connectPromise = nil
    sendEvent("onConnectionChanged", ["connected": true])
  }

  fileprivate func handleConnectionFailed(_ error: Error) {
    connectPromise?.reject("CONNECTION_FAILED", error.localizedDescription)
    connectPromise = nil
    sendEvent("onConnectionChanged", ["connected": false, "error": error.localizedDescription])
  }

  fileprivate func handleDisconnect(_ error: Error?) {
    sendEvent("onConnectionChanged", ["connected": false, "error": error?.localizedDescription ?? ""])
  }

  fileprivate func handlePlayerStateChange(_ state: SPTAppRemotePlayerState) {
    sendEvent("onPlayerStateChanged", stateToDict(state))
  }
}

// NSObject proxy — SPTAppRemoteDelegate requires NSObjectProtocol conformance,
// but Expo's Module base class is not an NSObject subclass.
fileprivate class SpotifyDelegateHandler: NSObject, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
  weak var module: SpotifyAppRemoteModule?

  init(module: SpotifyAppRemoteModule) {
    self.module = module
    super.init()
  }

  func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    module?.handleConnect()
  }

  func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
    module?.handleConnectionFailed(error ?? NSError(domain: "SpotifyAppRemote", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unknown connection error"]))
  }

  func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    module?.handleDisconnect(error)
  }

  func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
    module?.handlePlayerStateChange(playerState)
  }
}
