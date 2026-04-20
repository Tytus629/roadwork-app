import Toast from "react-native-toast-message";

export function toastSuccess(text1: string, text2?: string) {
  Toast.show({
    type: "success",
    text1,
    text2,
    position: "bottom",
    visibilityTime: 6000,
  });
}

export function toastError(text1: string, text2?: string) {
  Toast.show({
    type: "error",
    text1,
    text2,
    position: "bottom",
    visibilityTime: 6000,
  });
}
