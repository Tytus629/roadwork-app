import { db } from "../db/db";
import { AUTH_SCREEN_DIAGNOSTICS } from "../screens/AuthScreen";
import { ORG_PICKER_DIAGNOSTICS } from "../screens/OrgPickerScreen";
import { MORE_SCREEN_DIAGNOSTICS } from "../screens/MoreScreen";
import { CREATE_WIZARD_DIAGNOSTICS } from "../components/CreateWizardModal";
import {
  WORK_ORDER_PHOTO_SYNC_CONTRACT,
} from "../services/workOrderPhotosService";
import * as workOrderPhotoService from "../services/workOrderPhotosService";
import {
  assertOrgScopedStoragePath,
  assetPhotoPath,
  workOrderPhotoPath,
} from "../firebase/storagePaths";
import {
  normalizeWorkOrderAttachments,
  summarizeWorkOrderAttachmentContract,
} from "../workOrders/attachments";
import {
  resolveMapPressTarget,
  type MapPressResolution,
} from "./mapPressTargetResolver";

export type SmokeStatus = "PASS" | "WARN" | "FAIL" | "NOT_RUN";

export type SmokeCheck = {
  id: string;
  title: string;
  status: SmokeStatus;
  detail: string;
};

export type SmokeGroup = {
  id: string;
  title: string;
  status: SmokeStatus;
  checks: SmokeCheck[];
};

export type SmokeRunResult = {
  startedAtIso: string;
  finishedAtIso: string;
  status: SmokeStatus;
  groups: SmokeGroup[];
};

export type SmokeRunContext = {
  canClearOrgContext: boolean;
  devSmokeRouteVisibleFromMore: boolean;
};

function statusRank(status: SmokeStatus): number {
  if (status === "FAIL") return 4;
  if (status === "WARN") return 3;
  if (status === "PASS") return 2;
  return 1;
}

function mergeStatus(statuses: SmokeStatus[]): SmokeStatus {
  let best: SmokeStatus = "NOT_RUN";
  for (const status of statuses) {
    if (statusRank(status) > statusRank(best)) {
      best = status;
    }
  }
  return best;
}

function tableExists(tableName: string): boolean {
  const result = db.executeSync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;",
    [tableName],
  );
  const rowsRaw: any = (result as any)?.rows;
  const rows = Array.isArray(rowsRaw)
    ? rowsRaw
    : typeof rowsRaw?.item === "function" && typeof rowsRaw?.length === "number"
      ? Array.from({ length: rowsRaw.length }, (_unused, i) => rowsRaw.item(i))
      : [];
  return rows.length > 0;
}

function runResolverContractChecks(): SmokeCheck[] {
  const checks: Array<{ name: string; result: MapPressResolution; expect: SmokeStatus; validate: () => boolean }> = [
    {
      name: "Bridge near tap resolves asset",
      result: resolveMapPressTarget({
        assetCandidates: [{ id: "asset_bridge_1", assetType: "BRIDGE", distanceMeters: 32, source: "bridge" }],
      }),
      expect: "PASS",
      validate: () => {
        const out = resolveMapPressTarget({
          assetCandidates: [{ id: "asset_bridge_1", assetType: "BRIDGE", distanceMeters: 32, source: "bridge" }],
        });
        return out.kind === "asset" && out.assetId === "asset_bridge_1";
      },
    },
    {
      name: "Guardrail line tap prefers linked asset",
      result: resolveMapPressTarget({
        workOrderCandidates: [{ id: "wo_g1", type: "guardrail_repair", distanceMeters: 22, linkedAssetId: "asset_guard_22" }],
      }),
      expect: "PASS",
      validate: () => {
        const out = resolveMapPressTarget({
          workOrderCandidates: [{ id: "wo_g1", type: "guardrail_repair", distanceMeters: 22, linkedAssetId: "asset_guard_22" }],
        });
        return out.kind === "asset" && out.assetId === "asset_guard_22";
      },
    },
    {
      name: "Non-linear near line opens work order",
      result: resolveMapPressTarget({
        workOrderCandidates: [{ id: "wo_line_1", type: "ditching", distanceMeters: 12 }],
      }),
      expect: "PASS",
      validate: () => {
        const out = resolveMapPressTarget({
          workOrderCandidates: [{ id: "wo_line_1", type: "ditching", distanceMeters: 12 }],
        });
        return out.kind === "work_order" && out.workOrderId === "wo_line_1";
      },
    },
    {
      name: "Too-far tap resolves none",
      result: resolveMapPressTarget({
        workOrderCandidates: [{ id: "wo_far", type: "pothole", distanceMeters: 90 }],
      }),
      expect: "PASS",
      validate: () => {
        const out = resolveMapPressTarget({
          workOrderCandidates: [{ id: "wo_far", type: "pothole", distanceMeters: 90 }],
        });
        return out.kind === "none";
      },
    },
  ];

  return checks.map((entry, index) => {
    const ok = entry.validate();
    return {
      id: `map-resolver-${index + 1}`,
      title: entry.name,
      status: ok ? entry.expect : "FAIL",
      detail: ok ? `Expected contract met (${entry.result.reason}).` : "Expected contract did not match.",
    };
  });
}

export async function runDeveloperSmokeTests(context: SmokeRunContext): Promise<SmokeRunResult> {
  const startedAtIso = new Date().toISOString();

  const authGroup: SmokeGroup = {
    id: "auth-layout",
    title: "Auth Layout",
    checks: [
      {
        id: "auth-scroll",
        title: "Auth screen uses scroll container",
        status: AUTH_SCREEN_DIAGNOSTICS.hasScrollView ? "PASS" : "FAIL",
        detail: AUTH_SCREEN_DIAGNOSTICS.hasScrollView
          ? "Auth screen declares ScrollView for smaller devices."
          : "ScrollView contract not declared.",
      },
      {
        id: "auth-kav",
        title: "Auth screen uses keyboard avoidance",
        status: AUTH_SCREEN_DIAGNOSTICS.hasKeyboardAvoidingView ? "PASS" : "FAIL",
        detail: AUTH_SCREEN_DIAGNOSTICS.hasKeyboardAvoidingView
          ? "KeyboardAvoidingView contract is declared."
          : "KeyboardAvoidingView contract not declared.",
      },
    ],
    status: "NOT_RUN",
  };
  authGroup.status = mergeStatus(authGroup.checks.map((check) => check.status));

  const orgGroup: SmokeGroup = {
    id: "org-picker",
    title: "Org Picker + Join Flow",
    checks: [
      {
        id: "org-join-action",
        title: "Join New Org action exists",
        status: ORG_PICKER_DIAGNOSTICS.hasJoinNewOrgAction ? "PASS" : "FAIL",
        detail: ORG_PICKER_DIAGNOSTICS.hasJoinNewOrgAction
          ? `Join action label: ${ORG_PICKER_DIAGNOSTICS.joinButtonLabel}`
          : "Join action contract missing.",
      },
      {
        id: "org-clear",
        title: "Org context can clear without sign out",
        status: context.canClearOrgContext ? "PASS" : "FAIL",
        detail: context.canClearOrgContext
          ? "clearOrgId is available from org context."
          : "clearOrgId was not available.",
      },
    ],
    status: "NOT_RUN",
  };
  orgGroup.status = mergeStatus(orgGroup.checks.map((check) => check.status));

  const moreGroup: SmokeGroup = {
    id: "more-screen",
    title: "More Screen Reachability",
    checks: [
      {
        id: "more-scroll",
        title: "More root uses ScrollView",
        status: MORE_SCREEN_DIAGNOSTICS.rootUsesScrollView ? "PASS" : "FAIL",
        detail: MORE_SCREEN_DIAGNOSTICS.rootUsesScrollView
          ? "More screen contract includes root ScrollView."
          : "More screen contract does not include root ScrollView.",
      },
      {
        id: "more-route",
        title: "Smoke route reachable from More (DEV)",
        status: context.devSmokeRouteVisibleFromMore ? "PASS" : "WARN",
        detail: context.devSmokeRouteVisibleFromMore
          ? "Developer Smoke Tests row is visible in DEV builds."
          : "Route row not visible; verify DEV build and navigation wiring.",
      },
    ],
    status: "NOT_RUN",
  };
  moreGroup.status = mergeStatus(moreGroup.checks.map((check) => check.status));

  const mapCreateGroup: SmokeGroup = {
    id: "map-create-ui",
    title: "Map + Create Menu",
    checks: [
      {
        id: "create-scroll",
        title: "Create wizard body is scrollable",
        status: CREATE_WIZARD_DIAGNOSTICS.usesScrollViewBody ? "PASS" : "FAIL",
        detail: CREATE_WIZARD_DIAGNOSTICS.usesScrollViewBody
          ? "Create wizard uses ScrollView for long content."
          : "Create wizard is not marked as scrollable.",
      },
      {
        id: "create-max-height",
        title: "Create wizard constrains modal height",
        status: CREATE_WIZARD_DIAGNOSTICS.usesMaxHeightSheet ? "PASS" : "WARN",
        detail: CREATE_WIZARD_DIAGNOSTICS.usesMaxHeightSheet
          ? "Create wizard sheet uses maxHeight to avoid viewport clipping."
          : "No maxHeight contract declared.",
      },
      {
        id: "create-bottom-padding",
        title: "Create wizard includes bottom padding",
        status: CREATE_WIZARD_DIAGNOSTICS.hasBottomPaddingInBodyContent ? "PASS" : "WARN",
        detail: CREATE_WIZARD_DIAGNOSTICS.hasBottomPaddingInBodyContent
          ? "Body content includes bottom padding to reduce overlap risk."
          : "Bottom padding contract missing; verify safe area overlap on small devices.",
      },
    ],
    status: "NOT_RUN",
  };
  mapCreateGroup.status = mergeStatus(mapCreateGroup.checks.map((check) => check.status));

  const mapRoutingChecks = runResolverContractChecks();
  const mapRoutingGroup: SmokeGroup = {
    id: "map-routing",
    title: "Map Tap Routing Resolver",
    checks: mapRoutingChecks,
    status: mergeStatus(mapRoutingChecks.map((check) => check.status)),
  };

  const requiredTables = ["work_orders", "offline_work_orders", "outbox", "photos", "asset_events"];
  const missingTables = requiredTables.filter((tableName) => !tableExists(tableName));
  const hasAssetPhotoPath = (() => {
    try {
      const path = assetPhotoPath({ orgId: "org_smoke", assetId: "asset_smoke", fileName: "photo.jpg" });
      return path.startsWith("orgs/org_smoke/assets/asset_smoke/photos/");
    } catch {
      return false;
    }
  })();

  const hasAddAssetPhotoExport = typeof (workOrderPhotoService as any).addAssetPhoto === "function";

  const testWorkOrderPath = workOrderPhotoPath({
    orgId: "org_smoke",
    workOrderId: "wo_smoke",
    fileName: "photo.jpg",
  });
  let scopedPathOk = false;
  try {
    const validated = assertOrgScopedStoragePath("org_smoke", testWorkOrderPath);
    scopedPathOk = validated.startsWith("orgs/org_smoke/");
  } catch {
    scopedPathOk = false;
  }

  const attachmentNormalizerOk =
    typeof normalizeWorkOrderAttachments === "function" &&
    typeof summarizeWorkOrderAttachmentContract === "function";

  const photoSyncGroup: SmokeGroup = {
    id: "photo-sync",
    title: "Photo Sync Contracts",
    checks: [
      {
        id: "photo-db-tables",
        title: "Required local DB tables exist",
        status: missingTables.length === 0 ? "PASS" : "FAIL",
        detail:
          missingTables.length === 0
            ? `All required tables present: ${requiredTables.join(", ")}`
            : `Missing required tables: ${missingTables.join(", ")}`,
      },
      {
        id: "photo-metadata-model",
        title: "Attachment metadata model mappers are available",
        status: attachmentNormalizerOk ? "PASS" : "FAIL",
        detail: attachmentNormalizerOk
          ? "normalizeWorkOrderAttachments and summarizeWorkOrderAttachmentContract are available."
          : "Attachment metadata mapper contract is incomplete.",
      },
      {
        id: "photo-org-path",
        title: "Upload paths are org-scoped",
        status: scopedPathOk && WORK_ORDER_PHOTO_SYNC_CONTRACT.storagePathMustBeOrgScoped ? "PASS" : "FAIL",
        detail: scopedPathOk
          ? `Validated org-scoped path: ${testWorkOrderPath}`
          : "Failed to validate org-scoped upload path contract.",
      },
      {
        id: "photo-post-upload",
        title: "Metadata is written after upload",
        status:
          WORK_ORDER_PHOTO_SYNC_CONTRACT.writesAttachmentMetadataAfterUpload &&
          WORK_ORDER_PHOTO_SYNC_CONTRACT.enqueuesAttachmentPatchAfterUpload
            ? "PASS"
            : "FAIL",
        detail:
          "Contract requires attachment metadata write and work order patch after successful upload.",
      },
      {
        id: "photo-asset-support",
        title: "Asset photo path contract and uploader support",
        status: hasAssetPhotoPath ? (hasAddAssetPhotoExport ? "PASS" : "WARN") : "FAIL",
        detail: hasAssetPhotoPath
          ? hasAddAssetPhotoExport
            ? "Asset photo path helper and uploader export are both available."
            : "Asset photo path helper exists; dedicated addAssetPhoto uploader export not found."
          : "Asset photo path helper contract failed.",
      },
    ],
    status: "NOT_RUN",
  };
  photoSyncGroup.status = mergeStatus(photoSyncGroup.checks.map((check) => check.status));

  const groups = [authGroup, orgGroup, moreGroup, mapCreateGroup, mapRoutingGroup, photoSyncGroup];
  const status = mergeStatus(groups.map((group) => group.status));

  return {
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    status,
    groups,
  };
}

export function buildSmokeRunClipboardText(result: SmokeRunResult): string {
  const lines: string[] = [];
  lines.push(`WayCrew Developer Smoke Tests`);
  lines.push(`Started: ${result.startedAtIso}`);
  lines.push(`Finished: ${result.finishedAtIso}`);
  lines.push(`Overall: ${result.status}`);
  lines.push("");

  for (const group of result.groups) {
    lines.push(`[${group.status}] ${group.title}`);
    for (const check of group.checks) {
      lines.push(`- [${check.status}] ${check.title}: ${check.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
