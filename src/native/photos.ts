import { Platform } from "react-native";
import { PERMISSIONS, RESULTS, request } from "react-native-permissions";

function isGranted(result: string): boolean {
  return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
}

export async function requestCameraPermission(): Promise<boolean> {
  const perm =
    Platform.OS === "android"
      ? PERMISSIONS.ANDROID.CAMERA
      : PERMISSIONS.IOS.CAMERA;

  const res = await request(perm);
  return isGranted(res);
}

export async function requestPhotoLibraryPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    // Android's system picker can grant URI access without a separate runtime
    // permission prompt, so don't block opening the picker here.
    return true;
  }

  const res = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
  return isGranted(res);
}
