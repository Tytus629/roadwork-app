module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/test/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@react-native-firebase)/)',
  ],
  moduleNameMapper: {
    '^@op-engineering/op-sqlite$': '<rootDir>/test/mocks/opSqlite.js',
    '^react-native-fs$': '<rootDir>/test/mocks/reactNativeFs.js',
    '^react-native-gesture-handler$': '<rootDir>/test/mocks/reactNativeGestureHandler.js',
    '^react-native-maps$': '<rootDir>/test/mocks/reactNativeMaps.js',
    '^react-native-image-picker$': '<rootDir>/test/mocks/reactNativeImagePicker.js',
    '^@react-native-community/netinfo$': '<rootDir>/test/mocks/reactNativeNetInfo.js',
    '^@react-native-firebase/crashlytics$': '<rootDir>/test/mocks/reactNativeFirebaseCrashlytics.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/mocks/reactNativeAsyncStorage.js',
    '^@notifee/react-native$': '<rootDir>/test/mocks/notifee.js',
    '^react-native-permissions$': '<rootDir>/test/mocks/reactNativePermissions.js',
    '^@react-native-community/geolocation$': '<rootDir>/test/mocks/reactNativeGeolocation.js',
    '^react-native-toast-message$': '<rootDir>/test/mocks/reactNativeToastMessage.js',
    '^react-native-share$': '<rootDir>/test/mocks/reactNativeShare.js',
    '^@react-native-clipboard/clipboard$': '<rootDir>/test/mocks/reactNativeClipboard.js',
  },
};
