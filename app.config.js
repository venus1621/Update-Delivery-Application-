module.exports = ({ config }) => {
  const envApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const existingApiKey = config?.android?.config?.googleMaps?.apiKey || '';
  const apiKey = envApiKey || existingApiKey || '';

  return {
    ...config,
    android: {
      ...(config.android || {}),
      config: {
        ...((config.android && config.android.config) || {}),
        googleMaps: {
          apiKey,
        },
      },
    },
  };
};
