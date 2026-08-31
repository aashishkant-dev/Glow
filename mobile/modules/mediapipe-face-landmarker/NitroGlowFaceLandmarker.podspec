require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'NitroGlowFaceLandmarker'
  s.version        = package['version']
  s.summary        = 'Live MediaPipe Face Landmarker frame-processor plugin for the skin-scan camera (iOS)'
  s.homepage       = 'https://github.com/aashishkant-dev/Glow'
  s.license        = 'MIT'
  s.author         = 'Glow'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  # NitroModules pod dependency is added automatically by add_nitrogen_files
  # below (its own generated code: `spec.dependency "NitroModules"`) — that's
  # the real CocoaPods pod name (confirmed against the generated
  # +autolinking.rb), which differs from the npm package name
  # (react-native-nitro-modules); declaring it again here by the npm name
  # would be a second, wrongly-named, redundant dependency line.
  # MediaPipeTasksVision — the real, official Google-published pod. Version
  # unpinned here on purpose (left to whatever's current at install time);
  # pin an exact version once this has actually been built once and the
  # working version is known, rather than guessing one now.
  s.dependency 'MediaPipeTasksVision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
  # The .task model file (see ios/Resources/face_landmarker.task) needs to
  # ship as a resource bundle, not a source file — HybridGlowFaceLandmarker
  # .swift resolves it via Bundle(for:).path(forResource:ofType:), which
  # only finds resources CocoaPods actually bundled this way, not plain
  # source-tree files.
  s.resource_bundles = {
    'NitroGlowFaceLandmarker' => ['ios/Resources/*.task'],
  }

  load 'nitrogen/generated/ios/NitroGlowFaceLandmarker+autolinking.rb'
  add_nitrogen_files(s)
end
