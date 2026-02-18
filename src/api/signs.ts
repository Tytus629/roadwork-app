import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getApp } from "@react-native-firebase/app";

export type UpsertSignInput = {
  orgId: string;
  signCategory: string;
  signCode: string;
  signName: string;
  lat: number;
  lng: number;
};

export async function upsertSignForWorkOrder(input: UpsertSignInput) {
  const functions = getFunctions(getApp());
  const fn = httpsCallable(functions, "roadwork_upsertSignForWorkOrder");
  const res = await fn(input);
  return res.data as { signId: string; merged: boolean; distFt?: number };
}
