const Clipboard = {
  setString: jest.fn(() => undefined),
  getString: jest.fn(async () => ''),
  hasString: jest.fn(async () => false),
};

module.exports = Clipboard;
module.exports.default = Clipboard;
