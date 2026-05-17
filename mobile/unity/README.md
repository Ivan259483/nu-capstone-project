# Unity native builds (mobile)

Place Unity **Unity as a Library** outputs here so `@azesmway/react-native-unity` can link:

| Path | Contents |
|------|-----------|
| `mobile/unity/builds/ios/UnityFramework.framework` | iOS framework from Xcode (see `../unity/VehicleIntelligenceAR/README.md`) |
| `mobile/unity/builds/android/unityLibrary/` | Android export from Unity (contains `build.gradle`) |

Until these exist, `react-native.config.js` disables native autolinking for the Unity package so Expo prebuild does not fail.

## Clean iOS Pods after the Unity podspec patch

If Xcode still compiles Unity export files from `node_modules/@azesmway/react-native-unity/ios`
such as `VideoPlayer.mm`, `UnityWebRequest.mm`, or `iPhone_Sensors.mm`, CocoaPods is using stale
generated Pods metadata. Reinstall Pods from the patched podspec before rebuilding:

```bash
cd /Users/ivan/Documents/AutoSPF+/mobile
npm run ios:pods:clean
npm run verify:unity:ios
npm run ios
```

The clean command reapplies `vendor/react-native-unity.podspec`, runs `pod cache clean --all`,
removes generated `ios/Pods`, `ios/Podfile.lock`, and `ios/build`, then runs `pod install`.
For an Xcode-level clean rebuild, use:

```bash
cd /Users/ivan/Documents/AutoSPF+/mobile
npm run ios:clean
```
