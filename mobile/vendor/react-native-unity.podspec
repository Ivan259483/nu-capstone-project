require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

Pod::Spec.new do |s|
  s.name         = "react-native-unity"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "12.4" }
  s.source       = { :git => "https://github.com/azesmway/react-native-unity.git", :tag => "#{s.version}" }

  # AutoSPF+ patch: the npm tarball ships a partial Unity Xcode export (Classes/, Il2CppOutputProject/, …).
  # Compiling `ios/**/*.{h,m,mm}` pulls Il2CPP headers that conflict with the real `UnityFramework.framework`
  # copied from `mobile/unity/builds/ios`. Only build the RN ↔ Unity bridge here; IL2CPP lives inside the framework.
  s.source_files = "ios/RNUnityView.{h,mm}", "ios/RNUnityViewManager.mm"

  # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
  s.dependency "React-Core"

  # Don't install the dependencies when we run `pod install` in the old architecture.
  if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
    s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
    s.pod_target_xcconfig    = {
        "DEFINES_MODULE" => "YES",
        "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
        "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
        "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
    }
    s.dependency "React-RCTFabric"
    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
    s.dependency "RCTRequired"
    s.dependency "RCTTypeSafety"
    s.dependency "ReactCommon/turbomodule/core"
   end
  end

  unity_pod_xcconfig = {
    "FRAMEWORK_SEARCH_PATHS" => "$(inherited) \"$(PODS_TARGET_SRCROOT)/ios\"",
    "HEADER_SEARCH_PATHS" => "$(inherited) \"$(PODS_TARGET_SRCROOT)/ios/UnityFramework.framework/Headers\" \"$(PODS_TARGET_SRCROOT)/ios/Libraries/Plugins/iOS\""
  }
  prior = s.attributes_hash["pod_target_xcconfig"] || {}
  s.pod_target_xcconfig = prior.merge(unity_pod_xcconfig) do |_key, old, new|
    "#{old} #{new}"
  end

  # Host app links `-framework UnityFramework` via CocoaPods but only inherits pod_target_xcconfig from
  # some pods — ensure the app target can resolve the vendored framework under node_modules.
  s.user_target_xcconfig = {
    "FRAMEWORK_SEARCH_PATHS" => "$(inherited) \"$(PODS_ROOT)/../../node_modules/@azesmway/react-native-unity/ios\""
  }

  # Copy the real Unity iOS framework from the app repo (`mobile/unity/builds/ios`) into this pod's `ios/`
  # when it exists. During local development the package may already contain a built framework from a
  # previous Unity build, so keep that framework instead of disabling the RNUnityView native bridge.
  s.prepare_command =
  <<-'CMD'
    set -e
    POD_ROOT="$(pwd)"
    MOBILE_ROOT="$(cd "$POD_ROOT/../../.." && pwd)"
    SRC="$MOBILE_ROOT/unity/builds/ios"
    HAS_SOURCE_FRAMEWORK=0
    if [ -f "$SRC/UnityFramework.framework/UnityFramework" ]; then
      HAS_SOURCE_FRAMEWORK=1
    elif [ ! -f "ios/UnityFramework.framework/UnityFramework" ]; then
      echo "react-native-unity: Unity iOS framework not found. Expected $SRC/UnityFramework.framework or ios/UnityFramework.framework in the package." >&2
      exit 1
    fi
    rm -rf ios/Il2CppOutputProject ios/Classes ios/MainApp ios/Libraries "ios/Unity-iPhone Tests" ios/Data 2>/dev/null || true
    if [ "$HAS_SOURCE_FRAMEWORK" = "1" ]; then
      rm -rf ios/UnityFramework.framework 2>/dev/null || true
      cp -R "$SRC/UnityFramework.framework" ios/
    fi
    if [ -d "$SRC/Data" ]; then
      rm -rf ios/UnityFramework.framework/Data 2>/dev/null || true
      cp -R "$SRC/Data" ios/UnityFramework.framework/Data
    elif [ ! -d "ios/UnityFramework.framework/Data" ]; then
      echo "react-native-unity: Unity iOS Data folder not found. Expected $SRC/Data or ios/UnityFramework.framework/Data in the package." >&2
      exit 1
    fi
    mkdir -p ios/UnityFramework.framework/Headers
    if [ -f ios/UnityFramework.framework/UnityFramework.h ]; then
      cp ios/UnityFramework.framework/UnityFramework.h ios/UnityFramework.framework/Headers/UnityFramework.h
    fi
    for header_dir in "$SRC/Classes" "$SRC/Libraries/Plugins/iOS" ios/Classes ios/Libraries/Plugins/iOS; do
      if [ -d "$header_dir" ]; then
        find "$header_dir" -name '*.h' -exec cp {} ios/UnityFramework.framework/Headers/ \;
      fi
    done
    PLIST="ios/UnityFramework.framework/Info.plist"
    if [ -f "$PLIST" ]; then
      # Unity ships Xcode placeholders; embedded frameworks must use literal values or codesign fails.
      /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.autospf.plus.unityframework" "$PLIST"
      /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable UnityFramework" "$PLIST" || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleName UnityFramework" "$PLIST" || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleDevelopmentRegion en" "$PLIST" || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleVersion 1" "$PLIST" || true
    fi
  CMD

  s.vendored_frameworks = ["ios/UnityFramework.framework"]
end
