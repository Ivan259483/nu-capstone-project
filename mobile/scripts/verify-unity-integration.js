#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rel = (p) => path.relative(root, p) || '.';
const iosOnly = process.argv.includes('--ios-only');

const checks = [];
let failures = 0;
let warnings = 0;

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

function missingBinaryStrings(p, strings) {
  const contents = fs.readFileSync(path.join(root, p));
  return strings.filter((value) => !contents.includes(value));
}

function record(level, label, detail) {
  checks.push({ level, label, detail });
  if (level === 'FAIL') failures += 1;
  if (level === 'WARN') warnings += 1;
}

function pass(label, detail) {
  record('PASS', label, detail);
}

function warn(label, detail) {
  record('WARN', label, detail);
}

function fail(label, detail) {
  record('FAIL', label, detail);
}

const rnUnityPodspec = 'node_modules/@azesmway/react-native-unity/react-native-unity.podspec';
const rnUnityLocalPodspec = 'ios/Pods/Local Podspecs/react-native-unity.podspec.json';
const rnUnityPodsProject = 'ios/Pods/Pods.xcodeproj/project.pbxproj';
const rnUnityInstalledFramework = 'node_modules/@azesmway/react-native-unity/ios/UnityFramework.framework';
const rnUnityInstalledFrameworkData = `${rnUnityInstalledFramework}/Data`;
const expectedRnUnitySourceLine = 's.source_files = "ios/RNUnityView.{h,mm}", "ios/RNUnityViewManager.mm"';
const expectedRnUnitySources = ['ios/RNUnityView.{h,mm}', 'ios/RNUnityViewManager.mm'];
const expectedFrameworkSearchPath = '$(PODS_TARGET_SRCROOT)/ios';
const expectedFrameworkHeaders = [
  `${rnUnityInstalledFramework}/Headers/UnityFramework.h`,
  `${rnUnityInstalledFramework}/Headers/UnityAppController.h`,
  `${rnUnityInstalledFramework}/Headers/RenderPluginDelegate.h`,
  `${rnUnityInstalledFramework}/Headers/LifeCycleListener.h`,
  `${rnUnityInstalledFramework}/Headers/NativeCallProxy.h`,
];
const forbiddenRnUnityBuildSources = [
  'VideoPlayer.mm',
  'UnityWebRequest.mm',
  'iPhone_Sensors.mm',
  'Il2CppOutputProject',
];

function arrayFrom(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function sameStringSet(actual, expected) {
  return actual.length === expected.length && expected.every((item) => actual.includes(item));
}

const iosFramework = 'unity/builds/ios/UnityFramework.framework';
const iosFrameworkBinary = `${iosFramework}/UnityFramework`;
const iosData = 'unity/builds/ios/Data';
const iosDataScene = `${iosData}/level0`;
const expectedUnitySceneObjects = ['VehicleIntelligenceBridge', 'XR Origin', 'AR Session'];
const androidUnityLibrary = 'unity/builds/android/unityLibrary';
const androidUnityGradle = `${androidUnityLibrary}/build.gradle`;
const androidUnityManifest = `${androidUnityLibrary}/src/main/AndroidManifest.xml`;

if (exists(iosFrameworkBinary)) {
  pass('iOS UaaL export', rel(path.join(root, iosFramework)));
} else if (exists(`${rnUnityInstalledFramework}/UnityFramework`)) {
  pass('iOS UnityFramework package seed', `${rnUnityInstalledFramework}/UnityFramework`);
} else {
  fail(
    'iOS UnityFramework missing',
    `${iosFramework} does not contain a built UnityFramework binary, and ${rnUnityInstalledFramework}/UnityFramework is also missing.`
  );
}

if (exists(iosDataScene)) {
  pass('iOS Unity player data export', `${iosData}/`);
  const missingSceneObjects = missingBinaryStrings(iosDataScene, expectedUnitySceneObjects);
  if (missingSceneObjects.length === 0) {
    pass('iOS Unity AR scene export', expectedUnitySceneObjects.join(', '));
  } else {
    fail('iOS Unity AR scene export', `${iosDataScene} is missing ${missingSceneObjects.join(', ')}. Re-run the Unity iOS export before rebuilding the app.`);
  }
} else if (exists(`${rnUnityInstalledFrameworkData}/level0`)) {
  pass('iOS UnityFramework embedded player data', `${rnUnityInstalledFrameworkData}/`);
} else {
  fail(
    'iOS Unity player data missing',
    `${iosData}/level0 does not exist, and ${rnUnityInstalledFrameworkData}/level0 is also missing. Unity can mount natively but render black without this data.`
  );
}

if (!iosOnly) {
  if (exists(androidUnityGradle)) {
    pass('Android UaaL export', rel(path.join(root, androidUnityGradle)));
  } else {
    fail('Android UaaL export missing', `${androidUnityGradle} does not exist.`);
  }

  if (exists(androidUnityManifest)) {
    const manifest = read(androidUnityManifest);
    if (manifest.includes('<intent-filter')) {
      fail('Android Unity manifest', 'Remove the launcher <intent-filter> from unityLibrary/src/main/AndroidManifest.xml.');
    } else {
      pass('Android Unity manifest', 'No launcher intent-filter found.');
    }
  } else {
    warn('Android Unity manifest not checked', `${androidUnityManifest} does not exist yet.`);
  }
}

const pkg = JSON.parse(read('package.json'));
if (pkg.dependencies && pkg.dependencies['@azesmway/react-native-unity']) {
  pass('@azesmway/react-native-unity dependency', pkg.dependencies['@azesmway/react-native-unity']);
} else {
  fail('@azesmway/react-native-unity dependency', 'Dependency is missing from package.json.');
}

if (exists(rnUnityPodspec)) {
  const podspec = read(rnUnityPodspec);
  if (podspec.includes(expectedRnUnitySourceLine)) {
    pass('react-native-unity npm podspec patch', expectedRnUnitySourceLine);
  } else {
    fail('react-native-unity npm podspec patch', `${rnUnityPodspec} is not limited to RNUnityView sources. Run npm install or node scripts/apply-react-native-unity-podspec.js.`);
  }
} else {
  warn('react-native-unity npm podspec patch', `${rnUnityPodspec} does not exist yet. Run npm install.`);
}

if (exists(rnUnityLocalPodspec)) {
  try {
    const localSpec = JSON.parse(read(rnUnityLocalPodspec));
    const sourceFiles = arrayFrom(localSpec.source_files);
    if (sameStringSet(sourceFiles, expectedRnUnitySources)) {
      pass('CocoaPods react-native-unity local podspec', `source_files = ${sourceFiles.join(', ')}`);
    } else {
      fail('CocoaPods react-native-unity local podspec', `${rnUnityLocalPodspec} has source_files = ${sourceFiles.join(', ') || '(empty)'}. Run npm run ios:pods:clean.`);
    }

    const podTargetXcconfig = localSpec.pod_target_xcconfig || {};
    const frameworkSearchPaths = podTargetXcconfig.FRAMEWORK_SEARCH_PATHS || '';
    const headerSearchPaths = podTargetXcconfig.HEADER_SEARCH_PATHS || '';
    if (frameworkSearchPaths.includes(expectedFrameworkSearchPath) && headerSearchPaths.includes('UnityFramework.framework/Headers')) {
      pass('CocoaPods UnityFramework search paths', 'FRAMEWORK_SEARCH_PATHS and HEADER_SEARCH_PATHS include UnityFramework.');
    } else {
      fail('CocoaPods UnityFramework search paths', `${rnUnityLocalPodspec} is missing UnityFramework search paths. Run npm run ios:pods:clean.`);
    }
  } catch (error) {
    fail('CocoaPods react-native-unity local podspec', `Could not parse ${rnUnityLocalPodspec}: ${error.message}`);
  }
} else if (exists('ios/Pods')) {
  warn('CocoaPods react-native-unity local podspec', `${rnUnityLocalPodspec} is missing. Run npm run ios:pods:clean to regenerate Pods.`);
} else {
  warn('CocoaPods react-native-unity local podspec', 'Pods are not installed yet.');
}

if (exists(rnUnityPodsProject)) {
  const podsProject = read(rnUnityPodsProject);
  const forbiddenSources = forbiddenRnUnityBuildSources.filter((source) => podsProject.includes(source));
  if (forbiddenSources.length > 0) {
    fail('CocoaPods react-native-unity build sources', `Pods project still references ${forbiddenSources.join(', ')}. Run npm run ios:pods:clean before rebuilding.`);
  } else if (podsProject.includes('RNUnityView.mm') && podsProject.includes('RNUnityViewManager.mm')) {
    pass('CocoaPods react-native-unity build sources', 'Only RNUnityView bridge sources are present.');
  } else {
    warn('CocoaPods react-native-unity build sources', 'RNUnityView bridge sources were not found in Pods.xcodeproj. Run pod install after Unity export setup.');
  }
} else {
  warn('CocoaPods react-native-unity build sources', `${rnUnityPodsProject} does not exist yet.`);
}

const missingFrameworkHeaders = expectedFrameworkHeaders.filter((header) => !exists(header));
if (missingFrameworkHeaders.length === 0) {
  pass('UnityFramework public headers', 'UnityFramework imports and NativeCallProxy are available under UnityFramework.framework/Headers.');
} else if (exists(rnUnityInstalledFramework)) {
  fail('UnityFramework public headers', `${missingFrameworkHeaders.join(', ')} missing. Run npm run ios:pods:clean.`);
} else {
  warn('UnityFramework public headers', `${rnUnityInstalledFramework} does not exist yet. Run npm run ios:pods:clean.`);
}

if (exists(`${rnUnityInstalledFramework}/UnityFramework`)) {
  pass('UnityFramework binary', `${rnUnityInstalledFramework}/UnityFramework`);
} else if (exists(rnUnityInstalledFramework)) {
  warn('UnityFramework binary', `${rnUnityInstalledFramework}/UnityFramework is missing. The current folder looks like a Unity Xcode export placeholder, not the built framework product.`);
}

if (exists(`${rnUnityInstalledFrameworkData}/level0`)) {
  pass('UnityFramework embedded player data', `${rnUnityInstalledFrameworkData}/level0`);
  const missingEmbeddedSceneObjects = missingBinaryStrings(`${rnUnityInstalledFrameworkData}/level0`, expectedUnitySceneObjects);
  if (missingEmbeddedSceneObjects.length === 0) {
    pass('UnityFramework embedded AR scene data', expectedUnitySceneObjects.join(', '));
  } else {
    fail('UnityFramework embedded AR scene data', `${rnUnityInstalledFrameworkData}/level0 is missing ${missingEmbeddedSceneObjects.join(', ')}. Run node scripts/apply-react-native-unity-podspec.js before rebuilding.`);
  }
} else if (exists(iosDataScene)) {
  fail('UnityFramework embedded player data', `${rnUnityInstalledFrameworkData}/level0 is missing. Run npm run ios:pods:clean or pod install before rebuilding.`);
} else {
  warn('UnityFramework embedded player data', 'Unity player Data is not available yet.');
}

if (exists('react-native.config.js')) {
  const rnConfig = read('react-native.config.js');
  if (
    rnConfig.includes('UnityFramework.framework') &&
    rnConfig.includes('@azesmway/react-native-unity/ios/UnityFramework.framework/UnityFramework') &&
    rnConfig.includes('unityLibrary/build.gradle')
  ) {
    pass('React Native Unity autolink guard', 'react-native.config.js checks both Unity export locations.');
  } else {
    fail('React Native Unity autolink guard', 'react-native.config.js does not check both expected Unity export paths.');
  }
} else {
  fail('React Native Unity autolink guard', 'react-native.config.js is missing.');
}

const appConfig = JSON.parse(read('app.json')).expo;
const plugins = appConfig.plugins || [];
if (plugins.some((plugin) => Array.isArray(plugin) ? plugin[0] === './plugins/withUnityAndroidGradle.js' : plugin === './plugins/withUnityAndroidGradle.js')) {
  pass('Expo Unity Android plugin', './plugins/withUnityAndroidGradle.js is registered.');
} else {
  fail('Expo Unity Android plugin', 'app.json does not include ./plugins/withUnityAndroidGradle.js.');
}

const iosCamera = appConfig.ios && appConfig.ios.infoPlist && appConfig.ios.infoPlist.NSCameraUsageDescription;
if (iosCamera) {
  pass('iOS camera permission', iosCamera);
} else {
  fail('iOS camera permission', 'NSCameraUsageDescription is missing from app.json.');
}

if (!iosOnly) {
  const androidPerms = (appConfig.android && appConfig.android.permissions) || [];
  if (androidPerms.includes('CAMERA')) {
    pass('Android camera permission', 'CAMERA is declared.');
  } else {
    fail('Android camera permission', 'CAMERA is missing from app.json android.permissions.');
  }
}

if (exists('ios') || (!iosOnly && exists('android'))) {
  if (!iosOnly && exists('android/settings.gradle')) {
    const settings = read('android/settings.gradle');
    if (settings.includes("':unityLibrary'")) {
      pass('Android prebuild Unity include', 'android/settings.gradle includes :unityLibrary.');
    } else if (exists(androidUnityGradle)) {
      fail('Android prebuild Unity include', 'Unity export exists, but android/settings.gradle does not include :unityLibrary. Run npx expo prebuild from mobile/.');
    } else {
      warn('Android prebuild Unity include', 'Unity export is missing, so prebuild correctly has nothing to include yet.');
    }
  } else if (!iosOnly) {
    warn('Android prebuild output', 'android/settings.gradle does not exist.');
  }

  if (exists('ios/Podfile')) {
    pass('iOS prebuild output', 'ios/Podfile exists.');
  } else {
    warn('iOS prebuild output', 'ios/Podfile does not exist.');
  }
} else {
  warn('Expo prebuild output', 'mobile/ios and mobile/android are not present. After copying Unity exports, run npx expo prebuild from mobile/.');
}

for (const check of checks) {
  const mark = check.level === 'PASS' ? 'OK' : check.level;
  console.log(`[${mark}] ${check.label}${check.detail ? ` - ${check.detail}` : ''}`);
}

console.log(`\nUnity integration check: ${failures} failure(s), ${warnings} warning(s).`);
process.exitCode = failures > 0 ? 1 : 0;
