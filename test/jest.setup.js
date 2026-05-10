// Workspace-level Jest setup for native-module-free unit tests.

jest.mock('@react-native-firebase/app', () => ({
	getApp: jest.fn(() => ({ name: '[DEFAULT]', options: {} })),
}));

jest.mock('@react-native-firebase/auth', () => ({
	getAuth: jest.fn(() => ({
		currentUser: null,
	})),
	onAuthStateChanged: jest.fn((_auth, callback) => {
		if (typeof callback === 'function') callback(null);
		return () => undefined;
	}),
	signInWithEmailAndPassword: jest.fn(async () => ({})),
	createUserWithEmailAndPassword: jest.fn(async () => ({ user: { uid: 'test-uid' } })),
	sendPasswordResetEmail: jest.fn(async () => undefined),
}));

jest.mock('@react-native-firebase/firestore', () => ({
	getFirestore: jest.fn(() => ({})),
	doc: jest.fn(() => ({})),
	getDoc: jest.fn(async () => ({ exists: () => false, data: () => ({}) })),
}));

jest.mock('@react-native-firebase/functions', () => ({
	getFunctions: jest.fn(() => ({})),
	httpsCallable: jest.fn(() => jest.fn(async () => ({ data: {} }))),
}));

jest.mock('@react-native-firebase/storage', () => ({
	getStorage: jest.fn(() => ({})),
	ref: jest.fn((_storage, path) => ({
		path,
		putFile: jest.fn(async () => undefined),
	})),
	getDownloadURL: jest.fn(async () => 'https://example.com/photo.jpg'),
}));

jest.mock('react-native-device-info', () => ({
	getSystemName: jest.fn(() => 'TestOS'),
	getVersion: jest.fn(() => '0.0.0-test'),
	getBuildNumber: jest.fn(() => '0'),
	getBundleId: jest.fn(() => 'com.test.app'),
	isEmulator: jest.fn(async () => true),
	isEmulatorSync: jest.fn(() => true),
	default: {
		getSystemName: jest.fn(() => 'TestOS'),
		getVersion: jest.fn(() => '0.0.0-test'),
		getBuildNumber: jest.fn(() => '0'),
		getBundleId: jest.fn(() => 'com.test.app'),
		isEmulator: jest.fn(async () => true),
		isEmulatorSync: jest.fn(() => true),
	},
}));
