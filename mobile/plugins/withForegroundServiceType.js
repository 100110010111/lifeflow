const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, async (config) => {
    const application = config.modResults.manifest.application[0];
    const services = application.service || [];
    for (const service of services) {
      if (service.$['android:name'] === 'com.asterinet.react.bgactions.RNBackgroundActionsTask') {
        service.$['android:foregroundServiceType'] = 'dataSync';
      }
    }
    return config;
  });
};
