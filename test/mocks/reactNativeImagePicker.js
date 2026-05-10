const imagePicker = {
  launchCamera: jest.fn(async () => ({ didCancel: true })),
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
};

module.exports = imagePicker;
module.exports.default = imagePicker;
