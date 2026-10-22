const React = require('react');
module.exports = {
  Camera: React.forwardRef(() => null),
  useCameraDevice: () => null,
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({ hasPermission: false, requestPermission: async () => false }),
};
