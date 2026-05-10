const RNFS = {
  CachesDirectoryPath: '/tmp',
  copyFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
};

module.exports = RNFS;
module.exports.default = RNFS;
