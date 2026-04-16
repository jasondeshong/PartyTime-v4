Pod::Spec.new do |s|
  s.name           = 'ExpoSpotifyAppRemote'
  s.version        = '1.0.0'
  s.summary        = 'Spotify App Remote bridge for Expo'
  s.description    = 'Connects to Spotify iOS app via SPTAppRemote for seamless playback control'
  s.license        = 'MIT'
  s.author         = 'Jason DeShong'
  s.homepage       = 'https://github.com/jasondeshong/PartyTime-v4'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.source_files   = '*.{h,m,swift}'
  s.dependency 'ExpoModulesCore'
  s.vendored_frameworks = 'SpotifyiOS.xcframework'
end
