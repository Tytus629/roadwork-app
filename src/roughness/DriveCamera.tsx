/**
 * DriveCamera — small live preview that takes low-res stills on demand.
 * Uses react-native-vision-camera (image-picker can't shoot without user taps).
 */
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from "react-native-vision-camera";

export type DriveCameraHandle = { snap: () => Promise<{ path: string; width: number; height: number } | null> };

export const DriveCamera = forwardRef<DriveCameraHandle, { active: boolean }>(({ active }, refOut) => {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  // ~1280x720 keeps files ~150-300 KB and limits heat.
  const format = useCameraFormat(device, [{ photoResolution: { width: 1280, height: 720 } }]);
  const cam = useRef<Camera>(null);

  React.useEffect(() => {
    if (active && !hasPermission) requestPermission();
  }, [active, hasPermission, requestPermission]);

  useImperativeHandle(refOut, () => ({
    snap: async () => {
      if (!cam.current) return null;
      try {
        const p = await cam.current.takePhoto({ flash: "off", enableShutterSound: false });
        return { path: p.path, width: p.width, height: p.height };
      } catch (e) {
        console.warn("[DriveCamera] takePhoto failed", e);
        return null;
      }
    },
  }));

  if (!active) return null;
  if (!device || !hasPermission) {
    return <Text style={styles.msg}>{!device ? "No back camera found." : "Camera permission needed for drive photos."}</Text>;
  }
  return (
    <View style={styles.wrap}>
      <Camera ref={cam} style={StyleSheet.absoluteFill} device={device} format={format} isActive={active} photo photoQualityBalance="speed" />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 140, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  msg: { color: "#b45309", fontWeight: "700" },
});
