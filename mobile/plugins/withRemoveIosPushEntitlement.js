const { createRunOncePlugin, withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Free Apple Personal Team provisioning cannot include Push Notifications / aps-environment.
 * expo-notifications' autolinked plugin adds that entitlement — strip it for local device demos.
 * (Local notification APIs may still work for foreground scheduling; remote push will not.)
 */
module.exports = createRunOncePlugin(
  (config) =>
    withEntitlementsPlist(config, (c) => {
      if (c.modResults['aps-environment'] != null) {
        delete c.modResults['aps-environment'];
      }
      return c;
    }),
  'withRemoveIosPushEntitlement',
  '1.0.0'
);
