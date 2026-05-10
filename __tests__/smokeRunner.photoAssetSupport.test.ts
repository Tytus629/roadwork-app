jest.mock("../src/db/db", () => {
  const requiredTables = new Set([
    "work_orders",
    "offline_work_orders",
    "outbox",
    "photos",
    "asset_events",
  ]);

  return {
    db: {
      executeSync: jest.fn((_sql: string, params?: unknown[]) => {
        const tableName = String(params?.[0] ?? "");
        return {
          rows: requiredTables.has(tableName) ? [{ name: tableName }] : [],
        };
      }),
    },
  };
});

jest.mock("../src/screens/AuthScreen", () => ({
  AUTH_SCREEN_DIAGNOSTICS: {
    hasScrollView: true,
    hasKeyboardAvoidingView: true,
  },
}));

jest.mock("../src/screens/OrgPickerScreen", () => ({
  ORG_PICKER_DIAGNOSTICS: {
    hasJoinNewOrgAction: true,
    joinButtonLabel: "Join New Org",
  },
}));

jest.mock("../src/screens/MoreScreen", () => ({
  MORE_SCREEN_DIAGNOSTICS: {
    rootUsesScrollView: true,
  },
}));

jest.mock("../src/components/CreateWizardModal", () => ({
  CREATE_WIZARD_DIAGNOSTICS: {
    usesScrollViewBody: true,
    usesMaxHeightSheet: true,
    hasBottomPaddingInBodyContent: true,
  },
}));

jest.mock("../src/services/workOrderPhotosService", () => ({
  WORK_ORDER_PHOTO_SYNC_CONTRACT: {
    writesAttachmentMetadataAfterUpload: true,
    enqueuesAttachmentPatchAfterUpload: true,
    storagePathMustBeOrgScoped: true,
    requiredAttachmentFields: ["id"],
  },
  addAssetPhoto: jest.fn(async () => "photo-id"),
}));

jest.mock("../src/workOrders/attachments", () => ({
  normalizeWorkOrderAttachments: jest.fn(() => []),
  summarizeWorkOrderAttachmentContract: jest.fn(() => ({ ok: true })),
}));

import { runDeveloperSmokeTests } from "../src/dev/smokeRunner";

describe("runDeveloperSmokeTests photo asset support", () => {
  it("reports PASS when addAssetPhoto export is present", async () => {
    const result = await runDeveloperSmokeTests({
      canClearOrgContext: true,
      devSmokeRouteVisibleFromMore: true,
    });

    const photoSyncGroup = result.groups.find((group) => group.id === "photo-sync");
    expect(photoSyncGroup).toBeTruthy();

    const assetSupport = photoSyncGroup?.checks.find((check) => check.id === "photo-asset-support");
    expect(assetSupport).toBeTruthy();
    expect(assetSupport?.status).toBe("PASS");
  });
});
