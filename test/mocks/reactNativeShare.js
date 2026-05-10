const Share = {
  open: jest.fn(async () => ({ success: true })),
  shareSingle: jest.fn(async () => ({ success: true })),
  isPackageInstalled: jest.fn(async () => ({ isInstalled: true })),
};

module.exports = Share;
module.exports.default = Share;
