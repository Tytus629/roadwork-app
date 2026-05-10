const RESULTS = {
  UNAVAILABLE: 'unavailable',
  DENIED: 'denied',
  BLOCKED: 'blocked',
  GRANTED: 'granted',
  LIMITED: 'limited',
};

const PERMISSIONS = {
  IOS: {},
  ANDROID: {},
};

module.exports = {
  RESULTS,
  PERMISSIONS,
  request: jest.fn(async () => RESULTS.GRANTED),
  check: jest.fn(async () => RESULTS.GRANTED),
  checkMultiple: jest.fn(async () => ({})),
  requestMultiple: jest.fn(async () => ({})),
  openSettings: jest.fn(async () => undefined),
};
