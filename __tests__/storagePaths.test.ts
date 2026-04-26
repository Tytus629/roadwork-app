import {
  assetPhotoPath,
  assertOrgScopedPathsInPayload,
  assertOrgScopedStoragePath,
  attachmentPath,
  createOrgScopedUploadMeta,
  exportFilePath,
  inspectionAttachmentPath,
  isOrgScopedStoragePath,
  signPhotoPath,
  workOrderPhotoPath,
} from "../src/firebase/storagePaths";

describe("storagePaths", () => {
  const orgId = "org_123";

  it("builds required org-scoped work order photo path", () => {
    expect(
      workOrderPhotoPath({ orgId, workOrderId: "wo_1", fileName: "before.jpg" }),
    ).toBe("orgs/org_123/workOrders/wo_1/before.jpg");
  });

  it("builds required org-scoped asset/sign/inspection/export paths", () => {
    expect(assetPhotoPath({ orgId, assetId: "asset_9", fileName: "a.png" })).toBe(
      "orgs/org_123/assets/asset_9/photos/a.png",
    );
    expect(signPhotoPath({ orgId, signId: "sign_5", fileName: "s.png" })).toBe(
      "orgs/org_123/signs/sign_5/photos/s.png",
    );
    expect(
      inspectionAttachmentPath({
        orgId,
        inspectionId: "insp_7",
        fileName: "report.pdf",
      }),
    ).toBe("orgs/org_123/inspections/insp_7/attachments/report.pdf");
    expect(exportFilePath({ orgId, exportId: "exp_4", fileName: "daily.csv" })).toBe(
      "orgs/org_123/exports/exp_4/daily.csv",
    );
  });

  it("builds generic attachment path", () => {
    expect(
      attachmentPath({
        orgId,
        entityType: "workOrders",
        entityId: "wo_1",
        fileName: "note.txt",
      }),
    ).toBe("orgs/org_123/attachments/workOrders/wo_1/note.txt");
  });

  it("accepts org-scoped path and rejects legacy non-scoped path", () => {
    const ok = "orgs/org_123/workOrders/wo_1/file.jpg";
    expect(isOrgScopedStoragePath(orgId, ok)).toBe(true);
    expect(assertOrgScopedStoragePath(orgId, ok)).toBe(ok);

    expect(() =>
      assertOrgScopedStoragePath(orgId, "workOrders/wo_1/file.jpg"),
    ).toThrow(/Org-owned uploads must use org-scoped paths/);
  });

  it("validates outbox payload storage paths when present", () => {
    expect(() =>
      assertOrgScopedPathsInPayload(orgId, {
        storagePath: "orgs/org_123/workOrders/wo_1/file.jpg",
      }),
    ).not.toThrow();

    expect(() =>
      assertOrgScopedPathsInPayload(orgId, {
        attachments: [{ storagePath: "orgs/org_123/workOrders/wo_1/file.jpg" }],
      }),
    ).not.toThrow();

    expect(() =>
      assertOrgScopedPathsInPayload(orgId, {
        photoRefs: [{ storagePath: "legacy/file.jpg", entityId: "wo_1" }],
      }),
    ).toThrow(/org-scoped/);
  });

  it("creates upload metadata with orgId, storagePath, and entityId", () => {
    const meta = createOrgScopedUploadMeta({
      orgId,
      entityType: "workOrders",
      entityId: "wo_99",
      storagePath: "orgs/org_123/workOrders/wo_99/pic.jpg",
    });

    expect(meta).toEqual({
      orgId: "org_123",
      entityType: "workOrders",
      entityId: "wo_99",
      storagePath: "orgs/org_123/workOrders/wo_99/pic.jpg",
    });
  });
});
