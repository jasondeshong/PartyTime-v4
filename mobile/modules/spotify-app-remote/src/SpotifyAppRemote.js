import { requireNativeModule, EventEmitter } from "expo-modules-core";

const NativeModule = requireNativeModule("ExpoSpotifyAppRemote");
const emitter = new EventEmitter(NativeModule);

export function connect(accessToken) {
  return NativeModule.connect(accessToken);
}

export function disconnect() {
  return NativeModule.disconnect();
}

export function play(spotifyUri) {
  return NativeModule.play(spotifyUri);
}

export function pause() {
  return NativeModule.pause();
}

export function resume() {
  return NativeModule.resume();
}

export function seekTo(positionMs) {
  return NativeModule.seekTo(positionMs);
}

export function skipToNext() {
  return NativeModule.skipToNext();
}

export function getPlayerState() {
  return NativeModule.getPlayerState();
}

export function subscribeToPlayerState() {
  return NativeModule.subscribeToPlayerState();
}

export function unsubscribeFromPlayerState() {
  return NativeModule.unsubscribeFromPlayerState();
}

export function addPlayerStateListener(callback) {
  return emitter.addListener("onPlayerStateChanged", callback);
}

export function addConnectionListener(callback) {
  return emitter.addListener("onConnectionChanged", callback);
}
