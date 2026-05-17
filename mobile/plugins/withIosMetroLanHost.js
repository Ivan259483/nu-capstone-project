const { createRunOncePlugin, withAppDelegate } = require('expo/config-plugins');
const os = require('os');

/**
 * Physical iPhones resolve Metro as localhost → wrong host → "No script URL provided".
 * Sets RCTBundleURLProvider.jsLocation before jsBundleURL() (RN / Expo SDK 54 pattern).
 *
 * Host resolution (first match wins):
 * 1. Plugin option `host` from app.json
 * 2. EXPO_METRO_HOST or REACT_NATIVE_PACKAGER_HOSTNAME at prebuild time
 * 3. First non-internal IPv4 on an `en*` interface (typical Wi‑Fi on macOS), else any IPv4
 *
 * Port: option `port`, or RCT_METRO_PORT / EXPO_METRO_PORT, else 8081.
 *
 * Skip injection: EXPO_NO_IOS_METRO_LAN=1 (e.g. CI generating ios/ without a device).
 */
const BUNDLE_CALL =
  'RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")';

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  const en = candidates.find((c) => /^en\d/.test(c.name));
  return (en || candidates[0])?.address ?? '127.0.0.1';
}

function metroHostPort(options = {}) {
  if (process.env.EXPO_NO_IOS_METRO_LAN === '1') {
    return null;
  }
  const host =
    options.host ||
    process.env.EXPO_METRO_HOST ||
    process.env.REACT_NATIVE_PACKAGER_HOSTNAME ||
    pickLanIPv4();
  const port =
    options.port != null
      ? String(options.port)
      : process.env.RCT_METRO_PORT || process.env.EXPO_METRO_PORT || '8081';
  return `${host}:${port}`;
}

function patchAppDelegateForMetroLan(config, options = {}) {
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      return c;
    }
    let { contents } = c.modResults;
    if (contents.includes('// withIosMetroLanHost')) {
      return c;
    }
    if (!contents.includes(BUNDLE_CALL)) {
      return c;
    }

    const loc = metroHostPort(options);
    if (!loc) {
      return c;
    }

    const replacement = `{
      // withIosMetroLanHost — LAN Metro for physical iOS devices (see plugins/withIosMetroLanHost.js)
      RCTBundleURLProvider.sharedSettings().jsLocation = "${loc}"
      return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
    }()`;

    contents = contents.replace(BUNDLE_CALL, replacement);
    c.modResults.contents = contents;
    return c;
  });
}

/** @type {import('expo/config-plugins').ConfigPlugin<{ host?: string; port?: string | number } | void>} */
module.exports = (config, props = {}) =>
  createRunOncePlugin(
    (c) => patchAppDelegateForMetroLan(c, props),
    'withIosMetroLanHost',
    '1.0.0'
  )(config);
