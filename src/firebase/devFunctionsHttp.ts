import { getApp } from "@react-native-firebase/app";
import { getAuth, getIdToken } from "@react-native-firebase/auth";
import { getEmulatorHost } from "./emulators";

const DEFAULT_REGION = "us-central1";

function normalizeAssetType(value: unknown): "sign" | "guardrail" | "culvert" | "bridge" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "sign" || raw === "signs") return "sign";
  if (raw === "guardrail" || raw === "guard_rail" || raw === "guardrails") return "guardrail";
  if (raw === "culvert" || raw === "culverts" || raw === "drain_pipe" || raw === "drainpipe") {
    return "culvert";
  }
  if (raw === "bridge" || raw === "bridges") return "bridge";
  if (raw === "sign") return "sign";
  return null;
}

function getProjectId(): string {
  const app = getApp();
  return (
    (app as any)?.options?.projectId ||
    (app as any)?._options?.projectId ||
    ""
  );
}

function getLinePoints(payload: any): any[] | null {
  if (Array.isArray(payload?.geo)) return payload.geo;
  if (Array.isArray(payload?.geo?.line)) return payload.geo.line;
  if (Array.isArray(payload?.line)) return payload.line;
  if (Array.isArray(payload?.geometry?.coordinates)) return payload.geometry.coordinates;
  return null;
}

function summarizeUpsertWorkOrderWireRequest(functionName: string, payload: Record<string, any>) {
  const details =
    payload?.details && typeof payload.details === "object" && !Array.isArray(payload.details)
      ? payload.details
      : null;
  const linkage =
    payload?.assetLinkage && typeof payload.assetLinkage === "object" && !Array.isArray(payload.assetLinkage)
      ? payload.assetLinkage
      : null;
  const assetRef =
    payload?.assetRef && typeof payload.assetRef === "object" && !Array.isArray(payload.assetRef)
      ? payload.assetRef
      : null;
  const linePoints = getLinePoints(payload);
  const geo = payload?.geo;
  const geometry =
    payload?.geometry && typeof payload.geometry === "object" && !Array.isArray(payload.geometry)
      ? payload.geometry
      : null;
  const hasGeoArray = Array.isArray(geo);
  const hasGeoPointObject =
    !!geo &&
    typeof geo === "object" &&
    !Array.isArray(geo) &&
    typeof (geo as any).lat === "number" &&
    typeof (geo as any).lng === "number";
  const hasGeometryObject = !!geometry;
  const lineCoordCount = Array.isArray(geometry?.coordinates) ? geometry.coordinates.length : 0;

  return {
    functionName,
    workOrderId: payload?.workOrderId ?? payload?.id ?? null,
    orgId: payload?.orgId ?? null,
    type: payload?.type ?? null,
    status: payload?.status ?? null,
    priority: payload?.priority ?? null,
    geometryType: payload?.geometryType ?? payload?.geometry?.type ?? null,
    typeRaw: payload?.type ?? null,
    statusRaw: payload?.status ?? null,
    priorityRaw: payload?.priority ?? null,
    geometryTypeRaw: payload?.geometryType ?? payload?.geometry?.type ?? null,
    assetMatchMethodRaw: payload?.assetMatchMethod ?? payload?.assetMatch?.method ?? null,
    hasGeo: !!payload?.geo || !!payload?.geometry,
    hasGeoArray,
    hasGeoPointObject,
    hasGeometryObject,
    geometryShapeType: typeof geometry?.type === "string" ? geometry.type : null,
    payloadGeoPresent: payload?.geo !== undefined,
    payloadGeometryPresent: payload?.geometry !== undefined,
    pointLat: payload?.lat ?? payload?.geo?.lat ?? payload?.point?.lat ?? null,
    pointLng: payload?.lng ?? payload?.geo?.lng ?? payload?.point?.lng ?? null,
    linePointCount: Array.isArray(linePoints) ? linePoints.length : 0,
    lineCoordCount,
    topLevelKeys:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload).sort()
        : [],
    detailsKeys: details ? Object.keys(details).sort() : [],
    assetLinkageFields: linkage ? Object.keys(linkage).sort() : [],
    hasAssetRef: !!assetRef,
    assetRefFields: assetRef ? Object.keys(assetRef).sort() : [],
  };
}

export function getDevFunctionUrl(functionName: string, region = DEFAULT_REGION): string {
  const host = getEmulatorHost();
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing Firebase projectId; cannot build emulator function URL.");
  }
  return `http://${host}:5001/${projectId}/${region}/${functionName}`;
}

export async function callDevFunctionHttp<T = any>(
  functionName: string,
  payload: Record<string, any>,
  region = DEFAULT_REGION,
): Promise<T> {
  const url = getDevFunctionUrl(functionName, region);
  const user = getAuth(getApp()).currentUser;

  let token: string | null = null;
  if (user) {
    token = await Promise.race([
      getIdToken(user),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Auth token timeout")), 5000),
      ),
    ]);
  }

  if (__DEV__ && functionName === "roadwork_upsertWorkOrder") {
    const linkage = payload?.assetLinkage;
    const linkageObj =
      linkage && typeof linkage === "object" && !Array.isArray(linkage)
        ? linkage
        : null;
    const assetRef =
      payload?.assetRef && typeof payload.assetRef === "object" && !Array.isArray(payload.assetRef)
        ? payload.assetRef
        : null;
    const normalizedAssetType = normalizeAssetType(payload?.assetType ?? null);
    const normalizedLinkageAssetType = normalizeAssetType(
      linkageObj?.assetType ?? linkageObj?.type ?? null
    );
    const normalizedNestedLinkageAssetType = normalizeAssetType(
      linkageObj?.asset?.assetType ?? linkageObj?.asset?.type ?? null
    );
    const normalizedAssetRefAssetType = normalizeAssetType(
      assetRef?.assetType ?? assetRef?.type ?? null
    );
    console.log("[Sync][HTTP] roadwork_upsertWorkOrder request", {
      workOrderId: payload?.id ?? payload?.workOrderId ?? null,
      type: payload?.type ?? null,
      assetId: payload?.assetId ?? null,
      assetType: normalizedAssetType,
      assetMatchMethod:
        payload?.assetMatch?.method ?? payload?.assetMatchMethod ?? linkageObj?.assetMatchMethod ?? null,
      hasAssetLinkageObject: !!linkageObj,
      linkageAssetType: normalizedLinkageAssetType,
      linkageNestedAssetType: normalizedNestedLinkageAssetType,
      assetRefAssetType: normalizedAssetRefAssetType,
      assetRefTypeAlias: normalizedAssetRefAssetType,
    });

    console.log(
      "[OutboxDiag][wire-request] roadwork_upsertWorkOrder",
      summarizeUpsertWorkOrderWireRequest(functionName, payload),
    );
  }

  if (__DEV__ && functionName === "roadwork_requestJoinOrg") {
    console.log("[JoinOrg][HTTP] roadwork_requestJoinOrg request", {
      orgIdOrCode: payload?.orgIdOrCode ?? null,
    });
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: payload }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errObj = json?.error;
    const errMessage = errObj?.message ?? json?.message ?? `HTTP ${resp.status}`;
    const errStatus = errObj?.status ?? null;
    const errCode = errObj?.code ?? resp.status;
    const errDetails = errObj?.details ?? json?.details ?? null;

    if (__DEV__ && functionName === "roadwork_requestJoinOrg") {
      console.error("[JoinOrg][HTTP] roadwork_requestJoinOrg error envelope", {
        status: resp.status,
        error: errObj ?? null,
        body: json ?? null,
      });
    }

    const err: any = new Error(String(errMessage));
    // Mirror Firebase callable-style fields so callers can read code/message/details consistently.
    err.code = typeof errStatus === "string" && errStatus ? `functions/${errStatus.toLowerCase()}` : "functions/internal";
    err.details = errDetails;
    err.httpStatus = resp.status;
    err.functionName = functionName;
    err.userInfo = {
      code: errStatus ?? String(errCode),
      message: String(errMessage),
      details: errDetails,
      httpStatus: resp.status,
    };
    err.nativeErrorCode = errStatus ?? String(errCode);
    err.nativeErrorMessage = String(errMessage);
    throw err;
  }

  return (json?.result ?? json) as T;
}
