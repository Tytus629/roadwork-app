const instance = {};

function resolved() {
  return Promise.resolve(undefined);
}

module.exports = {
  getCrashlytics: jest.fn(() => instance),
  crash: jest.fn(() => undefined),
  log: jest.fn(() => undefined),
  recordError: jest.fn(() => undefined),
  setAttribute: jest.fn(() => resolved()),
  setAttributes: jest.fn(() => resolved()),
  setCrashlyticsCollectionEnabled: jest.fn(() => resolved()),
  setUserId: jest.fn(() => resolved()),
};
