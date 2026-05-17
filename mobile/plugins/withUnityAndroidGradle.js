const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  createRunOncePlugin,
  withProjectBuildGradle,
  withSettingsGradle,
  withGradleProperties,
  withStringsXml,
} = require('expo/config-plugins');

const UNITY_ANDROID_REL = '../unity/builds/android/unityLibrary';
const UNITY_FLAT_DIR = "project(':unityLibrary').projectDir}/libs";
const GAME_VIEW_DESCRIPTION = 'game_view_content_description';

function unityAndroidExportPresent(projectRoot) {
  return fs.existsSync(path.join(projectRoot, 'unity/builds/android/unityLibrary/build.gradle'));
}

/**
 * When Unity exports `unityLibrary` under mobile/unity/builds/android, inject Gradle include.
 */
const withUnitySettingsInclude = (config) =>
  withSettingsGradle(config, (c) => {
    const projectRoot = c.modRequest.projectRoot;
    if (!unityAndroidExportPresent(projectRoot)) return c;

    const block = `
// --- Vehicle Intelligence (Unity as Library) ---
include ':unityLibrary'
project(':unityLibrary').projectDir=new File('${UNITY_ANDROID_REL}')
`;
    if (c.modResults.language === 'groovy' && !c.modResults.contents.includes("':unityLibrary'")) {
      c.modResults.contents += block;
    }
    return c;
  });

const withUnityGradleProps = (config) =>
  withGradleProperties(config, (c) => {
    const projectRoot = c.modRequest.projectRoot;
    if (!unityAndroidExportPresent(projectRoot)) return c;

    const key = 'unityStreamingAssets';
    const exists = c.modResults.some((p) => p.type === 'property' && p.key === key);
    if (!exists) {
      c.modResults.push({ type: 'property', key, value: '.unity3d' });
    }
    return c;
  });

const addUnityFlatDir = (contents) => {
  if (contents.includes(UNITY_FLAT_DIR)) return contents;

  const flatDirBlock = `
        flatDir {
            dirs "\${project(':unityLibrary').projectDir}/libs"
        }
`;

  const repositoriesMatch = /allprojects\s*\{\s*repositories\s*\{/m;
  if (repositoriesMatch.test(contents)) {
    return contents.replace(repositoriesMatch, (match) => `${match}${flatDirBlock}`);
  }

  return `${contents}

allprojects {
    repositories {${flatDirBlock}    }
}
`;
};

const withUnityProjectBuildGradle = (config) =>
  withProjectBuildGradle(config, (c) => {
    const projectRoot = c.modRequest.projectRoot;
    if (!unityAndroidExportPresent(projectRoot)) return c;

    if (c.modResults.language === 'groovy') {
      c.modResults.contents = addUnityFlatDir(c.modResults.contents);
    }
    return c;
  });

const withUnityStrings = (config) =>
  withStringsXml(config, (c) => {
    const projectRoot = c.modRequest.projectRoot;
    if (!unityAndroidExportPresent(projectRoot)) return c;

    const item = AndroidConfig.Resources.buildResourceItem({
      name: GAME_VIEW_DESCRIPTION,
      value: 'Game view',
      translatable: false,
    });
    c.modResults = AndroidConfig.Strings.setStringItem([item], c.modResults);
    return c;
  });

module.exports = createRunOncePlugin(
  (config) => {
    let c = config;
    c = withUnitySettingsInclude(c);
    c = withUnityGradleProps(c);
    c = withUnityProjectBuildGradle(c);
    c = withUnityStrings(c);
    return c;
  },
  'withUnityAndroidGradle',
  '1.0.0'
);
