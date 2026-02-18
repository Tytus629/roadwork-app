import { getFirestore, collection, doc, setDoc, serverTimestamp } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { getApp } from "@react-native-firebase/app";

export type WorkOrder = {
  orgId: string;
  type: string; // "sign" | "pothole" | ...
  status: "needs" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt?: any;
  updatedAt?: any;
  createdBy: string;
  geometry?: any; // keep as your existing format
  signId?: string;

  // sign details snapshot (handy for list display even without joining)
  signCategory?: string;
  signCode?: string;
  signName?: string;
};

export async function createWorkOrder(orgId: string, wo: Omit<WorkOrder, "orgId" | "createdBy">) {
  const app = getApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const orgsCollection = collection(firestore, "orgs");
  const orgDoc = doc(orgsCollection, orgId);
  const workOrdersCollection = collection(orgDoc, "workOrders");
  const workOrderDoc = doc(workOrdersCollection);

  const now = serverTimestamp();
  const payload: WorkOrder = {
    orgId,
    createdBy: uid,
    ...wo,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(workOrderDoc, payload);
  return workOrderDoc.id;
}
