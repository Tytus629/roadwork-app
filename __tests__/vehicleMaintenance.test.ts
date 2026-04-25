import {
  buildMaintenanceReadingLabel,
  buildMaintenanceUnitLabel,
  defaultServiceRequest,
  normalizeVehicleSnapshot,
  parseDateInputToEpoch,
  vehicleSnapshotFromAsset,
} from "../src/utils/vehicleMaintenance";

describe("vehicleMaintenance helpers", () => {
  it("builds a snapshot from a linked vehicle asset", () => {
    const snapshot = vehicleSnapshotFromAsset({
      id: "veh_1",
      orgId: "org_1",
      unitNumber: "Truck 12",
      truckNumber: "Unit 12",
      make: "Ford",
      model: "F-550",
      year: 2024,
      vin: "VIN123",
      serialNumber: null,
      licensePlate: "ABC123",
      inServiceDate: null,
      status: "in_service",
      odometer: 140221,
      engineHours: 4820,
      notes: null,
      createdAt: null,
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
      createdByName: null,
      updatedByName: null,
    });

    expect(snapshot.unitNumber).toBe("Truck 12");
    expect(snapshot.engineHours).toBe(4820);
    expect(buildMaintenanceUnitLabel(snapshot, null)).toContain("Truck 12");
    expect(buildMaintenanceReadingLabel(snapshot)).toContain("mi");
  });

  it("normalizes manual vehicle snapshots and request defaults", () => {
    const snapshot = normalizeVehicleSnapshot({
      unitNumber: "Loader 4",
      make: "Caterpillar",
      model: "938M",
      year: 2021,
      odometer: null,
      engineHours: 3120,
    });

    expect(snapshot?.unitNumber).toBe("Loader 4");
    expect(snapshot?.engineHours).toBe(3120);
    expect(defaultServiceRequest({ complaint: "Hydraulic leak" }).requestType).toBe("repair");
  });

  it("parses preferred service date input", () => {
    expect(parseDateInputToEpoch("2026-04-19")).not.toBeNull();
    expect(parseDateInputToEpoch("not-a-date")).toBeNull();
  });
});