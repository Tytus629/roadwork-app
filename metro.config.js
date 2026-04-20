const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

function escapeForRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const appAndroidBuild = `${escapeForRegex(path.resolve(__dirname, "android", "build"))}[\\\\/].*`;
const nodeModuleAndroidBuild = ".*[\\\\/]node_modules[\\\\/].*[\\\\/]android[\\\\/]build[\\\\/].*";

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
	resolver: {
		// Avoid watching transient Gradle output folders under dependencies.
		blockList: new RegExp(`${nodeModuleAndroidBuild}|${appAndroidBuild}`),
	},
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
