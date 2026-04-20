import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getApp } from "@react-native-firebase/app";
import { requireOrgId } from "../org/requireOrg";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";

export type UpsertSignInput = {
  orgId: string;
  signCategory: string;
  signCode: string;
  signName: string;
  lat: number;
  lng: number;
};

export async function upsertSignForWorkOrder(input: UpsertSignInput) {
  const orgId = requireOrgId(input.orgId);
  if (__DEV__) {
    return callDevFunctionHttp<{ signId: string; merged: boolean; distFt?: number }>(
      "roadwork_upsertSignForWorkOrder",
      { ...input, orgId },
    );
  }

  const functions = getFunctions(getApp());
  const fn = httpsCallable(functions, "roadwork_upsertSignForWorkOrder");
  const res = await fn({ ...input, orgId });
  return res.data as { signId: string; merged: boolean; distFt?: number };
}
