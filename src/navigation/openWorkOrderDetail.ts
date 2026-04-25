import { Alert } from "react-native";

type WorkOrderDetailNavigation = {
  navigate: (routeName: string, params: { id: string }) => void;
};

type OpenWorkOrderDetailOptions = {
  missingTitle?: string;
  missingMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
};

export function openWorkOrderDetail(
  navigation: WorkOrderDetailNavigation,
  workOrderId: string | null | undefined,
  options?: OpenWorkOrderDetailOptions,
): boolean {
  const id = String(workOrderId ?? "").trim();
  if (!id) {
    Alert.alert(
      options?.missingTitle ?? "Work order unavailable",
      options?.missingMessage ?? "This work order is missing an ID.",
    );
    return false;
  }

  try {
    navigation.navigate("WorkItemSheet", { id });
    return true;
  } catch {
    Alert.alert(
      options?.errorTitle ?? "Unable to open work order",
      options?.errorMessage ?? "Please try again.",
    );
    return false;
  }
}