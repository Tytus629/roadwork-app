module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Remaining violations need behavior review (see docs/CLEANUP_PASS_1.md); keep visible as warnings.
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      files: ['__tests__/**', 'test/**', '**/*.test.{js,ts,tsx}', 'jest.config.js'],
      env: { jest: true },
    },
  ],
};
