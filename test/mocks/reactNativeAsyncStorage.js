const store = new Map();

const AsyncStorage = {
  setItem: jest.fn(async (key, value) => {
    store.set(String(key), String(value));
  }),
  getItem: jest.fn(async (key) => (store.has(String(key)) ? store.get(String(key)) : null)),
  removeItem: jest.fn(async (key) => {
    store.delete(String(key));
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  getAllKeys: jest.fn(async () => Array.from(store.keys())),
  multiGet: jest.fn(async (keys) => keys.map((key) => [key, store.get(String(key)) ?? null])),
  multiSet: jest.fn(async (entries) => {
    for (const [key, value] of entries) {
      store.set(String(key), String(value));
    }
  }),
  multiRemove: jest.fn(async (keys) => {
    for (const key of keys) {
      store.delete(String(key));
    }
  }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
