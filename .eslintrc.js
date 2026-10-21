module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['__tests__/**', 'test/**', '**/*.test.{js,ts,tsx}', 'jest.config.js'],
      env: { jest: true },
    },
  ],
};
