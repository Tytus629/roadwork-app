import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rw:selectedOrgId";

export async function setSelectedOrgId(orgId: string) {
  await AsyncStorage.setItem(KEY, orgId);
}

export async function getSelectedOrgId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function clearSelectedOrgId() {
  await AsyncStorage.removeItem(KEY);
}
