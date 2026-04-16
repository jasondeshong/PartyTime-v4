import ExpoModulesCore
import SpotifyiOS

let CLIENT_ID = "18f1b52ab93b4c6480b1599b64d9be5b"
let REDIRECT_URI = "partytime://callback"

public class SpotifyAppRemoteModule: Module, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
  private var appRemote: SPTAppRemote?
  private var connectPromise: Promise?
  private var isSubscribed = false

  public func definition() -> ModuleDefinition {
    Name("ExpoSpotifyAppRemote")

    Events("onPlayerStateChanged", "onConnectionChanged")

    AsyncFunction("connect") { (accessToken: String, promise: Promise) in
      let config = SPTConfiguration(clientID: CLIENT_ID, redirectURL: URL(string: REDIRECT_URI)!)
      self.appRemote = SPTAppRemote(configuration: config, logLevel: .debug)
      self.appRemote?.connectionParameters.accessToken = accessToken
      self.appRemote?.delegate = self
      self.connectPromise = promise
      self.appRemote?.connect()
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
      playerAPI.delegate = self
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

  // MARK: - SPTAppRemoteDelegate

  public func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
    connectPromise?.resolve(nil)
    connectPromise = nil
    sendEvent("onConnectionChanged", ["connected": true])
  }

  public func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error) {
    connectPromise?.reject("CONNECTION_FAILED", error.localizedDescription)
    connectPromise = nil
    sendEvent("onConnectionChanged", ["connected": false, "error": error.localizedDescription])
  }

  public func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
    sendEvent("onConnectionChanged", ["connected": false, "error": error?.localizedDescription ?? ""])
    // Auto-reconnect attempt
    if let token = appRemote.connectionParameters.accessToken {
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        appRemote.connect()
      }
    }
  }

  // MARK: - SPTAppRemotePlayerStateDelegate

  public func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
    sendEvent("onPlayerStateChanged", stateToDict(playerState))
  }

  // MARK: - Helpers

  private func stateToDict(_ state: SPTAppRemotePlayerState) -> [String: Any] {
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
