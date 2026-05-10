const notifee = {
  requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
  createChannel: jest.fn(async () => 'default'),
  displayNotification: jest.fn(async () => undefined),
  cancelAllNotifications: jest.fn(async () => undefined),
  getBadgeCount: jest.fn(async () => 0),
  setBadgeCount: jest.fn(async () => undefined),
};

module.exports = {
  __esModule: true,
  default: notifee,
  AndroidImportance: {
    HIGH: 4,
    DEFAULT: 3,
    LOW: 2,
  },
  AuthorizationStatus: {
    DENIED: 0,
    AUTHORIZED: 1,
  },
};
