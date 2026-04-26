#!/usr/bin/env node

const { spawnSync, execSync } = require("child_process");

const PORTS = [2468, 5001, 8080, 9099, 9199, 4000];

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

function pickUsbDeviceId() {
  const override = String(process.env.WAYCREW_ANDROID_DEVICE_ID || "").trim();
  if (override) return override;

  const all = getConnectedDevices();
  const physical = all.filter((d) => !d.id.startsWith("emulator-"));
  return physical[0]?.id || null;
}

function runAdb(args) {
  const result = spawnSync("adb", args, { stdio: "inherit", shell: true });
  return result.status === 0;
}

function run() {
  const deviceId = pickUsbDeviceId();
  if (!deviceId) {
    console.error("[adb-reverse] No physical Android USB device found.");
    console.error("[adb-reverse] Set WAYCREW_ANDROID_DEVICE_ID or connect a USB phone.");
    process.exit(1);
  }

  console.log("[adb-reverse] target usb device:", deviceId);

  let ok = true;
  for (const port of PORTS) {
    const success = runAdb(["-s", deviceId, "reverse", `tcp:${port}`, `tcp:${port}`]);
    if (!success) ok = false;
  }

  if (!ok) {
    console.error("[adb-reverse] One or more reverse commands failed.");
    process.exit(1);
  }

  console.log("[adb-reverse] Applied ports:", PORTS.join(", "));
}

run();
