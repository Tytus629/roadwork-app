const netInfo = {
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
    details: null,
  })),
};

module.exports = netInfo;
module.exports.default = netInfo;
