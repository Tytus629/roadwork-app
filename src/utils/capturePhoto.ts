/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAMERA PHOTO CAPTURE WITH RUNTIME PERMISSIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Captures photos from device camera with proper Android runtime permission handling.
 * 
 * ANDROID PERMISSION FLOW (Required for Android 6.0+):
 * 1. Manifest declares CAMERA permission (android/app/src/main/AndroidManifest.xml)
 * 2. Runtime request via PermissionsAndroid.request() before camera access
 * 3. User sees system dialog: "Camera Permission" with custom message
 * 4. If granted: Opens camera
 * 5. If denied: Shows user-friendly alert, suggests using gallery instead
 * 
 * TWO-TIER PERMISSION SYSTEM:
 * - MANIFEST (AndroidManifest.xml line 6): Declares app needs camera capability
 * - RUNTIME (this file): Requests permission when user actually needs camera
 * 
 * GRACEFUL FALLBACK:
 * - If permission denied, user can still add photos from gallery
 * - No crashes, just informative alerts
 * 
 * USAGE:
 * const result = await capturePhoto();
 * if (result) {
 *   // User took photo: { localUri, width, height }
 * } else {
 *   // User cancelled or permission denied
 * }
 * 
 * CHANGE HISTORY:
 * - Created to fix camera permission issues
 * - Implemented proper Android runtime permission flow
 * - Added user-friendly error messages and fallback suggestions
 */
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { launchCamera, CameraOptions } from "react-native-image-picker";

/**
 * Requests Android runtime CAMERA permission.
 * iOS doesn't need explicit check (handled by Info.plist).
 * 
 * @returns true if permission granted, false if denied
 */
async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: "Camera Permission",
      message: "We need camera access to attach photos to work orders.",
      buttonPositive: "OK",
      buttonNegative: "Cancel",
    }
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Opens device camera to capture a photo for work order attachment.
 * 
 * PERMISSION FLOW:
 * 1. Requests runtime permission (Android only)
 * 2. If denied, shows alert and returns null
 * 3. If granted, opens camera with back-facing camera default
 * 
 * RETURN VALUES:
 * - Success: { localUri, width, height } - Photo ready to attach
 * - Cancelled: null - User closed camera without taking photo
 * - Error: null - Camera error occurred, alert shown to user
 * 
 * ERROR HANDLING:
 * - Permission denied: User-friendly alert, suggests gallery fallback
 * - Camera error: Logs warning, shows alert
 * - No photo returned: Validates asset exists before returning
 * 
 * @returns Photo data or null if cancelled/failed
 */
export async function capturePhoto(): Promise<{ localUri: string; width?: number; height?: number } | null> {
  try {
    // Request permission before opening camera
    const ok = await ensureCameraPermission();
    if (!ok) {
      Alert.alert("Camera permission denied", "You can still add photos from the library.");
      return null;
    }

    const options: CameraOptions = {
      mediaType: "photo",
      cameraType: "back",
      saveToPhotos: false,
      includeBase64: false,
      quality: 1,
    };

    const res = await launchCamera(options);

    if (res.didCancel) return null;
    if (res.errorCode) {
      console.warn("[capturePhoto] error", res.errorCode, res.errorMessage);
      Alert.alert("Camera error", res.errorMessage ?? "Unable to open camera.");
      return null;
    }

    const asset = res.assets?.[0];
    const uri = asset?.uri;
    if (!uri) {
      Alert.alert("Camera error", "No photo was returned.");
      return null;
    }

    const localUri = uri.startsWith("file://") ? uri : `file://${uri}`;
    return { localUri, width: asset.width ?? undefined, height: asset.height ?? undefined };
  } catch (e) {
    console.warn("[capturePhoto] exception", e);
    Alert.alert("Camera error", "Unable to capture photo.");
    return null;
  }
}
