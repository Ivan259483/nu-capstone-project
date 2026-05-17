# Vehicle Intelligence AI Inspection (Unity)

Unity **6 LTS** project using **AR Foundation** for plane detection, procedural sedan/SUV/pickup placeholders, JSON-driven damage overlays, before/after repair preview, and React Native messaging via `@azesmway/react-native-unity`.

## First-time setup (Unity Editor)

1. Install **Unity Hub** → Editor **6000.0.x** (match `ProjectSettings/ProjectVersion.txt` or allow upgrade).
2. **Add** this folder (`unity/VehicleIntelligenceAR`) as a project in Hub and open it. Let Package Manager resolve AR Foundation / ARCore / ARKit / Newtonsoft.Json.
3. **XR Plug-in Management**: `Edit` → `Project Settings` → `XR Plug-in Management` → enable **ARKit** (iOS) and **ARCore** (Android).
4. **Bootstrap scene**: menu **VehicleIntelligence → Setup AR Scene (Vehicle Intelligence)**. This creates `Assets/Scenes/VehicleIntelligenceAR.unity` and registers it in **Build Settings**.
5. **Player settings**: set **Company / Product** as needed; **iOS** minimum version compatible with ARKit; **Android** minimum API for ARCore (see Google ARCore requirements).
6. **RN bridge headers (iOS)** are already under `Assets/Plugins/iOS/` (copied from `@azesmway/react-native-unity`). When updating the npm package, re-copy `NativeCallProxy.h` / `NativeCallProxy.mm` from `mobile/node_modules/@azesmway/react-native-unity/unity/Assets/Plugins/iOS/`.

## JSON contract (Flask → mobile → Unity)

`VehicleIntelligenceBridge.LoadDamageData(string)` accepts:

- **Wrapped**: `{ "vehicle_type": "sedan", "damages": [ { "damage_type", "damaged_part", "severity", ... } ] }`
- **Single hit** (Flask example): `{ "vehicle_type": "sedan", "damage_type": "scratch", "damaged_part": "front bumper", "severity": "moderate" }`

Aliases: `type` → `damage_type`, `affectedArea` → `damaged_part`. Severity: `minor` | `moderate` | `severe`.

## Export for React Native (Unity as a Library)

### Android

1. **File → Build Settings** → Android → **Export** to  
   `mobile/unity/builds/android`  
   (Unity creates `unityLibrary` there.)
2. In `unityLibrary/src/main/AndroidManifest.xml`, **remove** the launcher `<intent-filter>` block so the library does not register as a standalone app (see `@azesmway/react-native-unity` README).
3. From the **mobile** app root, run `npx expo prebuild` (or EAS) so `react-native.config.js` and the Expo plugin can wire `settings.gradle` / Gradle when `unityLibrary` is present.

### iOS

1. Build iOS **Xcode** project from Unity to a folder **outside** the RN repo.
2. Follow the upstream README for **Data** target membership, **NativeCallProxy** visibility, and building **UnityFramework.framework**.
3. Copy **`UnityFramework.framework`** into  
   `mobile/unity/builds/ios/`  
   so the path is `mobile/unity/builds/ios/UnityFramework.framework` (required by `react-native-unity` podspec `prepare_command`).

Until those build outputs exist, the mobile app **disables** autolinking for `@azesmway/react-native-unity` so `pod install` / Android Gradle still succeed; the **Unity AR** route shows a setup placeholder instead of the native view.

## Interaction

- **Tap** a detected horizontal plane to place the vehicle (one placement per session).
- **One finger drag** moves the model on the plane; **two fingers** pinch to scale and twist to rotate.
- **HUD**: View Damage / View AR Repair / Rotate Vehicle / Confirm Repair (sends `{ "event": "repair_confirmed" }` to RN).

Replace procedural meshes under `VehiclePrimitiveFactory` with real **GLB/FBX** prefabs when art is ready; keep anchor child names (`FrontBumper`, `LeftHeadlight`, …) stable so `PartAnchorResolver` keeps working.
