import { setActiveRoleForGuards } from "../src/permissions/rolePermissions";

jest.mock("../src/repositories/tailgateRepo", () => ({
  tailgateRepo: { upsert: jest.fn(async () => undefined) },
}));
jest.mock("../src/sync/enqueueTailgateUpsert", () => ({
  enqueueTailgateUpsert: jest.fn(),
}));

jest.mock("../src/repositories/dmiRepo", () => ({
  dmiRepo: { insert: jest.fn(async () => undefined) },
}));
jest.mock("../src/sync/enqueueDmiUpsert", () => ({
  enqueueDmiUpsert: jest.fn(),
}));

jest.mock("../src/repositories/counterRepo", () => ({
  counterRepo: { insert: jest.fn(async () => undefined) },
}));
jest.mock("../src/sync/enqueueCounterUpsert", () => ({
  enqueueCounterUpsert: jest.fn(),
}));

jest.mock("../src/repositories/assetsRepo", () => ({
  assetsRepo: { upsert: jest.fn(async () => undefined) },
}));
jest.mock("../src/repositories/assetEventsRepo", () => ({
  assetEventsRepo: { add: jest.fn(async () => undefined) },
}));

jest.mock("../src/db/workOrderPhotosRepo", () => ({
  addWorkOrderPhoto: jest.fn(() => "photo-id"),
  listWorkOrderPhotos: jest.fn(() => []),
  removeWorkOrderPhoto: jest.fn(),
}));

jest.mock("../src/state/DbEvents", () => ({
  emitDbChanged: jest.fn(),
}));

jest.mock("../src/utils/deviceMeta", () => ({
  getDeviceMeta: jest.fn(() => ({ deviceId: "device-1", appVersion: "1.0.0" })),
}));

import { tailgateService } from "../src/services/tailgateService";
import { dmiService } from "../src/services/dmiService";
import { counterService } from "../src/services/counterService";
import { assetsService } from "../src/services/assetsService";
import {
  addWorkOrderPhoto,
  removeWorkOrderPhoto,
} from "../src/services/workOrderPhotosService";
import { PermissionDeniedError } from "../src/permissions/rolePermissions";

const { tailgateRepo } = require("../src/repositories/tailgateRepo");
const { dmiRepo } = require("../src/repositories/dmiRepo");
const { counterRepo } = require("../src/repositories/counterRepo");
const { assetsRepo } = require("../src/repositories/assetsRepo");
const { assetEventsRepo } = require("../src/repositories/assetEventsRepo");
const workOrderPhotosRepo = require("../src/db/workOrderPhotosRepo");

describe("service permission guards", () => {
  beforeEach(() => {
    setActiveRoleForGuards("viewer");
    jest.clearAllMocks();
  });

  it("blocks tailgate writes for viewer", async () => {
    await expect(tailgateService.upsertAndEnqueue({} as any)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(tailgateRepo.upsert).not.toHaveBeenCalled();
  });

  it("allows tailgate writes for asset manager", async () => {
    setActiveRoleForGuards("asset_manager");
    await tailgateService.upsertAndEnqueue({ id: "t1" } as any);
    expect(tailgateRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it("blocks DMI writes for viewer", async () => {
    await expect(dmiService.insertAndEnqueue({} as any)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(dmiRepo.insert).not.toHaveBeenCalled();
  });

  it("allows DMI writes for asset manager", async () => {
    setActiveRoleForGuards("asset_manager");
    await dmiService.insertAndEnqueue({ id: "d1" } as any);
    expect(dmiRepo.insert).toHaveBeenCalledTimes(1);
  });

  it("blocks Counter writes for crew member", async () => {
    setActiveRoleForGuards("crew_member");
    await expect(counterService.insertAndEnqueue({} as any)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(counterRepo.insert).not.toHaveBeenCalled();
  });

  it("allows Counter writes for org admin", async () => {
    setActiveRoleForGuards("org_admin");
    await counterService.insertAndEnqueue({ id: "c1" } as any);
    expect(counterRepo.insert).toHaveBeenCalledTimes(1);
  });

  it("blocks asset writes for viewer", async () => {
    setActiveRoleForGuards("viewer");
    await expect(assetsService.upsert({} as any)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(assetsService.addEvent({} as any)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(assetsRepo.upsert).not.toHaveBeenCalled();
    expect(assetEventsRepo.add).not.toHaveBeenCalled();
  });

  it("allows asset writes for asset manager", async () => {
    setActiveRoleForGuards("asset_manager");
    await assetsService.upsert({ id: "a1" } as any);
    await assetsService.addEvent({ id: "e1" } as any);
    expect(assetsRepo.upsert).toHaveBeenCalledTimes(1);
    expect(assetEventsRepo.add).toHaveBeenCalledTimes(1);
  });

  it("allows work-order photo writes for viewer", async () => {
    await expect(
      addWorkOrderPhoto({ workOrderId: "w1", photo: { id: "p1" } as any })
    ).rejects.not.toBeInstanceOf(PermissionDeniedError);
    removeWorkOrderPhoto("p1");
    expect(workOrderPhotosRepo.addWorkOrderPhoto).toHaveBeenCalledTimes(1);
    expect(workOrderPhotosRepo.removeWorkOrderPhoto).toHaveBeenCalledTimes(1);
  });

  it("allows work-order photo writes for crew member", async () => {
    setActiveRoleForGuards("crew_member");
    await expect(
      addWorkOrderPhoto({
        workOrderId: "w1",
        photo: { id: "p1", uri: "file://p.jpg", createdAt: Date.now(), source: "camera" } as any,
      })
    ).rejects.not.toBeInstanceOf(PermissionDeniedError);
    removeWorkOrderPhoto("p1");
    expect(workOrderPhotosRepo.addWorkOrderPhoto).toHaveBeenCalledTimes(1);
    expect(workOrderPhotosRepo.removeWorkOrderPhoto).toHaveBeenCalledTimes(1);
  });
});
