#!/usr/bin/env node

const { spawnSync, execSync } = require("child_process");

function parseAdbDevicesOutput(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices attached"))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([id, state]) => ({ id, state }))
    .filter((d) => d.state === "device");
}

function getConnectedDevices() {
  try {
    const raw = execSync("adb devices", { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return parseAdbDevicesOutput(raw);
  } catch (e) {
    return [];
  }
}

function pickDevice(target) {
  const all = getConnectedDevices();
  const emulators = all.filter((d) => d.id.startsWith("emulator-"));
  const physical = all.filter((d) => !d.id.startsWith("emulator-"));

  if (target === "emu") {
    const override = String(process.env.WAYCREW_ANDROID_EMULATOR_ID || "").trim();
    if (override) return override;
    return emulators[0]?.id || null;
  }

  if (target === "usb") {
    const override = String(process.env.WAYCREW_ANDROID_DEVICE_ID || "").trim();
    if (override) return override;
    return physical[0]?.id || null;
  }

  return null;
}

function run() {
  const target = String(process.argv[2] || "").trim();
  if (target !== "usb" && target !== "emu") {
    console.error("Usage: node scripts/run-android-target.js <usb|emu>");
    process.exit(1);
  }

  const selected = pickDevice(target);
  const args = ["react-native", "run-android", "--port", "8081", "--no-packager"];

  if (selected) {
    args.push("--deviceId", selected);
  }

  console.log("[android-target] target=", target);
  console.log("[android-target] selectedDeviceId=", selected || "auto");

  const result = spawnSync("npx", args, { stdio: "inherit", shell: true });
  process.exit(result.status == null ? 1 : result.status);
}

run();
