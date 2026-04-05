package expo.modules.spotifyappremote

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.protocol.types.PlayerState

const val CLIENT_ID = "18f1b52ab93b4c6480b1599b64d9be5b"
const val REDIRECT_URI = "partytime://callback"

class SpotifyAppRemoteModule : Module() {
  private var spotifyAppRemote: SpotifyAppRemote? = null
  private var isSubscribed = false

  override fun definition() = ModuleDefinition {
    Name("ExpoSpotifyAppRemote")

    Events("onPlayerStateChanged", "onConnectionChanged")

    AsyncFunction("connect") { accessToken: String, promise: Promise ->
      val activity = appContext.currentActivity
        ?: return@AsyncFunction promise.reject("NO_ACTIVITY", "No activity available", null)

      val params = ConnectionParams.Builder(CLIENT_ID)
        .setRedirectUri(REDIRECT_URI)
        .showAuthView(false)
        .build()

      SpotifyAppRemote.connect(activity, params, object : Connector.ConnectionListener {
        override fun onConnected(remote: SpotifyAppRemote) {
          spotifyAppRemote = remote
          sendEvent("onConnectionChanged", mapOf("connected" to true))
          promise.resolve(null)
        }

        override fun onFailure(error: Throwable) {
          sendEvent("onConnectionChanged", mapOf("connected" to false, "error" to (error.message ?: "Unknown error")))
          promise.reject("CONNECTION_FAILED", error.message ?: "Connection failed", error)
        }
      })
    }

    AsyncFunction("disconnect") { promise: Promise ->
      spotifyAppRemote?.let {
        SpotifyAppRemote.disconnect(it)
      }
      spotifyAppRemote = null
      isSubscribed = false
      promise.resolve(null)
    }

    AsyncFunction("play") { uri: String, promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.play(uri).setResultCallback {
        promise.resolve(null)
      }.setErrorCallback { error ->
        promise.reject("PLAY_ERROR", error.message ?: "Play failed", null)
      }
    }

    AsyncFunction("pause") { promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.pause().setResultCallback {
        promise.resolve(null)
      }.setErrorCallback { error ->
        promise.reject("PAUSE_ERROR", error.message ?: "Pause failed", null)
      }
    }

    AsyncFunction("resume") { promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.resume().setResultCallback {
        promise.resolve(null)
      }.setErrorCallback { error ->
        promise.reject("RESUME_ERROR", error.message ?: "Resume failed", null)
      }
    }

    AsyncFunction("seekTo") { positionMs: Int, promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.seekTo(positionMs.toLong()).setResultCallback {
        promise.resolve(null)
      }.setErrorCallback { error ->
        promise.reject("SEEK_ERROR", error.message ?: "Seek failed", null)
      }
    }

    AsyncFunction("skipToNext") { promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.skipNext().setResultCallback {
        promise.resolve(null)
      }.setErrorCallback { error ->
        promise.reject("SKIP_ERROR", error.message ?: "Skip failed", null)
      }
    }

    AsyncFunction("getPlayerState") { promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.playerState.setResultCallback { state ->
        promise.resolve(stateToMap(state))
      }.setErrorCallback { error ->
        promise.reject("STATE_ERROR", error.message ?: "Failed to get state", null)
      }
    }

    AsyncFunction("subscribeToPlayerState") { promise: Promise ->
      val remote = spotifyAppRemote
        ?: return@AsyncFunction promise.reject("NOT_CONNECTED", "Not connected to Spotify", null)

      remote.playerApi.subscribeToPlayerState().setEventCallback { state ->
        sendEvent("onPlayerStateChanged", stateToMap(state))
      }.setErrorCallback { error ->
        promise.reject("SUBSCRIBE_ERROR", error.message ?: "Subscribe failed", null)
      }
      isSubscribed = true
      promise.resolve(null)
    }

    AsyncFunction("unsubscribeFromPlayerState") { promise: Promise ->
      isSubscribed = false
      promise.resolve(null)
    }
  }

  private fun stateToMap(state: PlayerState): Map<String, Any?> {
    return mapOf(
      "uri" to (state.track?.uri ?: ""),
      "trackName" to (state.track?.name ?: ""),
      "artistName" to (state.track?.artist?.name ?: ""),
      "albumName" to (state.track?.album?.name ?: ""),
      "durationMs" to (state.track?.duration ?: 0L),
      "positionMs" to state.playbackPosition,
      "isPaused" to state.isPaused,
    )
  }
}
