# Photo Attachments Mobile Contract

## Backend Contract Summary
- Work-order photo metadata is stored on the work-order document in `attachments[]`.
- Canonical metadata path: `orgs/{orgId}/workOrders/{workOrderId}.attachments[]`.
- Canonical storage path: `orgs/{orgId}/workOrders/{workOrderId}/{fileName}`.
- Alternate supported storage path: `orgs/{orgId}/attachments/{entityType}/{entityId}/{fileName}`.
- All storage paths must be org-scoped (`orgs/{orgId}/...`).

## Mobile Write Flow (Attach Photo)
1. User attaches/captures photo in `WorkItemSheet`.
2. `workOrderPhotosService.addWorkOrderPhoto` writes local SQLite photo row for immediate UI/offline preview.
3. Photo uploads to Firebase Storage at `orgs/{orgId}/workOrders/{workOrderId}/{fileName}`.
4. Service builds attachment metadata object aligned to backend contract.
5. Service merges attachment into work-order `attachments[]`.
6. Service calls `workOrdersService.patchAndEnqueue`.
7. Existing outbox path sends `roadwork_upsertWorkOrder` payload with `attachments[]` included.

## Mobile Read + Render Flow
1. Inbound remote sync listens to `orgs/{orgId}/workOrders`.
2. `remoteSync.toLocalWorkOrder` normalizes/preserves `attachments[]`.
3. Local repository persists `attachmentsJson` on `work_orders` rows.
4. `WorkItemSheet` reads local cached photo rows + attachment-derived remote photos.
5. Attachment photo rendering rules:
- Use `downloadURL` when present.
- If only `storagePath` is present, resolve with Firebase Storage `getDownloadURL`.
- Keep local URI rows for immediate preview/offline continuity.

## Offline Sync Expectations
- Attachments are persisted in local `work_orders.attachmentsJson` and `offline_work_orders.attachmentsJson`.
- Outbox row payload includes `attachments[]`.
- Retry path and wire diagnostics preserve `attachments[]`.
- Org-scoped validator checks `attachments[].storagePath` before send.

## Two-Device Smoke Test
1. Start Metro once.
2. Launch app on Device A and Device B under same org/user permissions.
3. On Device A, open existing work order and add a photo.
4. Confirm Device A DEV logs:
- `[WorkOrderPhotos][upload-complete]`
- `[WorkOrderPhotos][attachment-built]`
- `[WorkOrderPhotos][attachments-update]` with before/after counts
- `[Sync] UPSERT_WORK_ORDER attachments`
5. Wait for sync cycle.
6. On Device B, open same work order.
7. Confirm Device B DEV logs:
- `[RemoteSync][WO] inbound attachments`
- `[WorkOrderPhotos][attachment-photo-read]`
- optional `[WorkOrderPhotos][resolve-storage-url-success]` if URL resolved from storage path
8. Verify photo appears in Device B work-order details.

## Manual Firestore Verification (Required When Debugging)
After attaching a photo on Device A, verify the work-order document directly in Firebase Emulator UI:

1. Open Firestore emulator data browser.
2. Navigate to `orgs/{orgId}/workOrders/{workOrderId}`.
3. Confirm `attachments` exists and is a non-empty array.
4. Confirm at least one attachment has:
- `storagePath` beginning with `orgs/{orgId}/`
- `workOrderId` matching the document id
- either `downloadURL` or a resolvable `storagePath`

If local photo count is greater than 0 but `attachments[]` is missing from this document, photo sync is local-only and the upload/attachment write path failed.

## Common Failure Modes
- Upload succeeds but no attachment appears: `patchAndEnqueue` did not run or failed.
- Attachment present but no image: invalid/missing `downloadURL` and `storagePath` is unresolved.
- Backend rejects payload: attachment storage path not org-scoped.
- Duplicate photo chips: attachment IDs/photo IDs do not match local cached IDs.
- Device B stale data: remote sync listener not active for current org.
