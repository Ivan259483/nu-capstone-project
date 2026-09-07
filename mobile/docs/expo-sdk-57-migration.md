# Expo SDK 57 migration — 2026-09-06

A. ROOT CAUSE: The project was SDK 54 while the physical iPhone has Expo Go for SDK 57. The mobile directory is a standalone npm project within the repository: neither root nor mobile declares npm workspaces, and each has its own consistent npm lockfile. No custom Metro, Babel, or dynamic app configuration exists. There are no generated ios/android directories.

B. OLD SDK VERSION: SDK 54, expo 54.0.37, Expo Router 6.0.24, React Native 0.81.5, React 19.1.0.

C. NEW SDK VERSION: SDK 57, expo 57.0.20 (requested range ^57.0.0), Expo Router 57.0.19, React Native 0.86.3, React 19.2.3.

D. FILES CHANGED IN THIS MIGRATION:

- [package.json](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/package.json>)
- [package-lock.json](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/package-lock.json>)
- [app.json](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/app.json>)
- [src/app/(auth)/verify.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(auth)/verify.tsx>)
- [src/app/(auth)/welcome.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(auth)/welcome.tsx>)
- [src/app/(customer)/book.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(customer)/book.tsx>)
- [src/app/(customer)/scan/analyzing.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(customer)/scan/analyzing.tsx>)
- [src/app/(customer)/scan/index.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(customer)/scan/index.tsx>)
- [src/app/(customer)/scan/results.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(customer)/scan/results.tsx>)
- [src/app/(customer)/track.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(customer)/track.tsx>)
- [src/app/(screens)/ai-chat.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(screens)/ai-chat.tsx>)
- [src/app/(screens)/services.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/app/(screens)/services.tsx>)
- [src/components/AnimatedSplash.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/components/AnimatedSplash.tsx>)
- [src/components/GlobalErrorBoundary.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/components/GlobalErrorBoundary.tsx>)
- [src/components/ScanHUD.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/components/ScanHUD.tsx>)
- [src/components/booking/AddVehicleModal.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/components/booking/AddVehicleModal.tsx>)
- [src/components/ui/MotionOverlay.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/components/ui/MotionOverlay.tsx>)
- [src/features/ai-scan/components/ARRepairViewer.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/ARRepairViewer.tsx>)
- [src/features/ai-scan/components/BeforeAfterSlider.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/BeforeAfterSlider.tsx>)
- [src/features/ai-scan/components/DamageOverlayImage.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/DamageOverlayImage.tsx>)
- [src/features/ai-scan/components/ModelViewerARCard.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/ModelViewerARCard.tsx>)
- [src/features/ai-scan/components/PremiumScanner.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/PremiumScanner.tsx>)
- [src/features/ai-scan/components/WorkflowStepper.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/ai-scan/components/WorkflowStepper.tsx>)
- [src/features/settings/components/ProfileHeader.tsx](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/src/features/settings/components/ProfileHeader.tsx>)
- [docs/expo-sdk-57-migration.md](</Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile/docs/expo-sdk-57-migration.md>)

Existing edits from before this migration were preserved. The root package files, backend and web application were not edited.

E. PACKAGE VERSIONS CHANGED: The table shows installed versions from the before/after lockfiles. Expo selected compatible versions with its resolver. Transitive changes are recorded in package-lock.json.

| Package | Before | After |
| --- | --- | --- |
| @react-native-community/netinfo | 11.4.1 | 12.0.1 |
| @react-navigation/bottom-tabs | 7.16.1 | removed |
| @react-navigation/elements | 2.9.18 | removed |
| @react-navigation/native | 7.2.4 | removed |
| @types/react | 19.1.17 | 19.2.18 |
| expo | 54.0.37 | 57.0.20 |
| expo-auth-session | 7.0.11 | 57.0.11 |
| expo-av | 16.0.8 | removed |
| expo-blur | 15.0.8 | 57.0.2 |
| expo-constants | 18.0.14 | 57.0.17 |
| expo-crypto | 15.0.9 | 57.0.2 |
| expo-device | 8.0.10 | 57.0.1 |
| expo-file-system | 19.0.24 | 57.0.6 |
| expo-font | 14.0.12 | 57.0.3 |
| expo-glass-effect | 0.1.10 | 57.0.1 |
| expo-haptics | 15.0.8 | 57.0.2 |
| expo-image | 3.0.11 | 57.0.4 |
| expo-image-manipulator | 14.0.8 | 57.0.16 |
| expo-image-picker | 17.0.11 | 57.0.16 |
| expo-linear-gradient | 15.0.8 | 57.0.1 |
| expo-linking | 8.0.12 | 57.0.9 |
| expo-local-authentication | 17.0.9 | 57.0.2 |
| expo-notifications | 0.32.17 | 57.0.17 |
| expo-print | 15.0.8 | 57.0.1 |
| expo-router | 6.0.24 | 57.0.19 |
| expo-secure-store | 15.0.8 | 57.0.3 |
| expo-splash-screen | 31.0.13 | 57.0.8 |
| expo-status-bar | 3.0.9 | 57.0.1 |
| expo-symbols | 1.0.8 | 57.0.2 |
| expo-system-ui | 6.0.9 | 57.0.3 |
| expo-web-browser | 15.0.11 | 57.0.2 |
| react | 19.1.0 | 19.2.3 |
| react-dom | 19.1.0 | 19.2.3 |
| react-native | 0.81.5 | 0.86.3 |
| react-native-gesture-handler | 2.28.0 | 2.32.0 |
| react-native-reanimated | 4.1.7 | 4.5.1 |
| react-native-safe-area-context | 5.6.2 | 5.7.0 |
| react-native-screens | 4.16.0 | 4.26.2 |
| react-native-svg | 15.12.1 | 15.15.4 |
| react-native-webview | 13.15.0 | 13.16.1 |
| react-native-worklets | 0.5.1 | 0.10.1 |
| eslint-config-expo | 10.0.0 | 57.0.2 |
| typescript | 5.9.3 | 6.0.3 |
| expo-video | not installed | 57.0.3 |

@expo/vector-icons 15.1.1 was previously available transitively; it is now explicitly declared using Expo-selected ^15.0.2 because Expo no longer includes that dependency. The installed version remains 15.1.1. React Query, Firebase, Axios and other unrelated application dependencies retain their previous locked versions. expo-updates was not installed or imported, so none was added.

F. BREAKING CHANGES FIXED:

- SDK 55 removed expo-av from Expo Go. AnimatedSplash now uses expo-video with the same MP4, muted playback, no loop or controls, cover fit, 400 ms entry fade, 600 ms exit fade, two-second minimum, and three-second branded error fallback. Player listeners and fallback timers are cleaned up. Reanimated get/set accessors keep this component compatible with React Compiler lint rules.
- React Native removed StyleSheet.absoluteFillObject. Its equivalent StyleSheet.absoluteFill replaces it in 20 files.
- Removed the unsupported expo-status-bar backgroundColor prop from the AI chat route; the existing screen background remains in its layout.
- SDK 56+ Router no longer uses external React Navigation packages. Removed the three unused direct @react-navigation dependencies; there are no application imports from those packages. SDK 57 Router still exports useFocusEffect, so its existing root imports remain valid.
- Explicitly added @expo/vector-icons. Expo automatically added the expo-image, expo-status-bar and expo-video config plugins.
- SDK 57 uses the New Architecture. No legacy architecture opt-out or sdkVersion override exists. Scheme, identifiers, permissions, app assets and existing notification config were preserved.

Preservation check: all source changes except AnimatedSplash match mechanical replacements of the removed StyleSheet alias or the removed status-bar prop. useCustomerBookings.ts, useRealtimeSync.ts, customerBookingLifecycle.ts and the root layout are byte-identical to the pre-migration snapshot. All tracker code other than four equivalent StyleSheet aliases is byte-identical. Booking/payment/stage logic and API contracts were not changed.

G. EXPO DOCTOR: npx expo-doctor@latest passed twice, 21/21 checks, no issues detected.

H. TYPESCRIPT: npm run typecheck passed (TypeScript 6.0.3). Focused ESLint for AnimatedSplash and the AI chat route passed. Full-repository lint was not run.

I. METRO: npx expo start --clear started in Expo Go mode and produced a QR code. Manifest HTTP 200 with sdkVersion 57.0.0. The complete, non-lazy iOS development bundle returned HTTP 200: 14,679,232 bytes, 2,480 modules, including the tracker and booking hook. Source import scan: 1,029 references, zero unresolved imports. npm ls --all --json exited 0; git diff --check passed. Metro remains running at exp://192.168.18.164:8081.

J. REMAINING WARNINGS: npm audit reported 27 findings (1 low, 16 moderate, 8 high, 2 critical). No forced audit fixes were applied because that is outside SDK compatibility scope. Install-time peer-transition warnings did not remain in the final dependency tree. Tooling emitted a Worklets extension-resolution deprecation and terminal NO_COLOR/FORCE_COLOR warnings; neither prevented bundling. npm also reported three dependencies with unapproved lifecycle scripts. Physical iPhone interaction, authenticated tracker behavior, push delivery and Face ID were not exercised; successful bundling is not device acceptance.

K. EXACT COMMAND (stop an existing Metro instance with Ctrl+C before restarting):

```bash
cd "/Users/ivansantos/Desktop/capstone2 /nu-capstone-project/mobile" && npx expo start --clear
```

L. SCAN READINESS: Ready to scan with the user-reported Expo Go SDK 57 on a physical iPhone on the same Wi-Fi as this Mac. Device launch is still to be verified by scanning.

Official migration references: [SDK 55](https://expo.dev/changelog/sdk-55), [SDK 56](https://expo.dev/changelog/sdk-56), [SDK 57](https://expo.dev/changelog/sdk-57), [Expo Video](https://docs.expo.dev/versions/v57.0.0/sdk/video/).
