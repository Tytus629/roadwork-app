import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rw:selectedOrgId:v1";

export async function getSelectedOrgId() {
  return AsyncStorage.getItem(KEY);
}

export async function setSelectedOrgId(orgId: string) {
  await AsyncStorage.setItem(KEY, orgId);
}

export async function clearSelectedOrgId() {
  await AsyncStorage.removeItem(KEY);
}
