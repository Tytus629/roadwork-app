const calls: string[] = [];

jest.mock("../src/sync/enqueueWorkOrderDelete", () => ({
  enqueueWorkOrderDelete: jest.fn((orgId: string, id: string) => {
    calls.push(`enqueueDelete:${orgId}:${id}`);
  }),
}));

jest.mock("../src/db/workOrdersRepo", () => ({
  ...jest.requireActual("../src/db/workOrdersRepo"),
  deleteWorkOrder: jest.fn((id: string, orgId: string) => {
    calls.push(`localDelete:${orgId}:${id}`);
  }),
}));

import { removeWorkOrder } from "../src/services/workOrdersService";
import { setActiveRoleForGuards } from "../src/permissions/rolePermissions";
import { db } from "../src/db/db";
import { hasPendingWorkOrderDelete } from "../src/sync/outboxRepo";

describe("work order delete sync", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => setActiveRoleForGuards("viewer"));

  it("queues the server soft delete before removing the local row", () => {
    setActiveRoleForGuards("org_admin");
    removeWorkOrder("wo1", "org1");
    expect(calls).toEqual(["enqueueDelete:org1:wo1", "localDelete:org1:wo1"]);
  });

  it("does nothing when the role cannot delete", () => {
    setActiveRoleForGuards("crew_member");
    expect(() => removeWorkOrder("wo1", "org1")).toThrow();
    expect(calls).toEqual([]);
  });

  it("writes a DELETE_WORK_ORDER outbox row with the softDeleteWorkOrder payload shape", () => {
    const { enqueueWorkOrderDelete } = jest.requireActual("../src/sync/enqueueWorkOrderDelete");
    const spy = jest.spyOn(db, "executeSync").mockReturnValue({ rows: [] } as any);
    enqueueWorkOrderDelete("org1", "wo1", 123);
    const [dropSql, dropParams] = spy.mock.calls[0] as any[];
    expect(String(dropSql)).toContain("DELETE FROM outbox");
    expect(String(dropSql)).toContain("kind='UPSERT_WORK_ORDER'");
    expect(dropParams).toEqual(["org1", "wo1"]);
    const [sql, params] = spy.mock.calls[1] as any[];
    expect(String(sql)).toContain("INSERT OR IGNORE INTO outbox");
    expect(params[1]).toBe("org1");
    expect(params[2]).toBe("DELETE_WORK_ORDER");
    expect(params[3]).toBe("wo1");
    expect(JSON.parse(params[4])).toEqual({ orgId: "org1", workOrderId: "wo1", deletedAt: 123 });
    spy.mockRestore();
  });

  it("detects a retryable pending DELETE_WORK_ORDER job", () => {
    const spy = jest
      .spyOn(db, "executeSync")
      .mockReturnValueOnce({ rows: [{ c: 1 }] } as any)
      .mockReturnValueOnce({ rows: [{ c: 0 }] } as any);
    expect(hasPendingWorkOrderDelete("org1", "wo1")).toBe(true);
    expect(hasPendingWorkOrderDelete("org1", "wo2")).toBe(false);
    const [sql, params] = spy.mock.calls[0] as any[];
    expect(String(sql)).toContain("kind='DELETE_WORK_ORDER'");
    expect(params).toEqual(["org1", "wo1", 10]);
    spy.mockRestore();
  });
});
