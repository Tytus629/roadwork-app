const sub = () => ({ subscribe: () => ({ unsubscribe: () => undefined }) });
module.exports = {
  accelerometer: sub(),
  gyroscope: sub(),
  SensorTypes: { accelerometer: 'accelerometer', gyroscope: 'gyroscope' },
  setUpdateIntervalForType: () => undefined,
};
