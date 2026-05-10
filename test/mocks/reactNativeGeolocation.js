const geo = {
  getCurrentPosition: jest.fn((success) => {
    if (typeof success === 'function') {
      success({ coords: { latitude: 0, longitude: 0, accuracy: 1 }, timestamp: Date.now() });
    }
  }),
  watchPosition: jest.fn(() => 1),
  clearWatch: jest.fn(() => undefined),
  stopObserving: jest.fn(() => undefined),
};

module.exports = geo;
module.exports.default = geo;
