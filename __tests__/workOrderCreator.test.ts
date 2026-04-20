import { formatWorkOrderCreator } from "../src/utils/workOrderCreator";

describe("formatWorkOrderCreator", () => {
  it("prefers createdByDisplayName", () => {
    expect(
      formatWorkOrderCreator({
        createdByDisplayName: "Jane Crew",
        createdByFirstName: "Jane",
        createdByLastName: "Smith",
        createdByEmail: "jane@example.com",
      })
    ).toBe("Jane Crew");
  });

  it("falls back to first + last name", () => {
    expect(
      formatWorkOrderCreator({
        createdByDisplayName: "   ",
        createdByFirstName: "Jane",
        createdByLastName: "Smith",
        createdByEmail: "jane@example.com",
      })
    ).toBe("Jane Smith");
  });

  it("handles partial names safely", () => {
    expect(
      formatWorkOrderCreator({
        createdByDisplayName: null,
        createdByFirstName: "Jane",
        createdByLastName: "   ",
        createdByEmail: "jane@example.com",
      })
    ).toBe("Jane");

    expect(
      formatWorkOrderCreator({
        createdByDisplayName: null,
        createdByFirstName: null,
        createdByLastName: "Smith",
        createdByEmail: "jane@example.com",
      })
    ).toBe("Smith");
  });

  it("falls back to email when names are missing", () => {
    expect(
      formatWorkOrderCreator({
        createdByDisplayName: "",
        createdByFirstName: null,
        createdByLastName: undefined,
        createdByEmail: "jane@example.com",
      })
    ).toBe("jane@example.com");
  });

  it("returns Unknown when all creator fields are empty", () => {
    expect(
      formatWorkOrderCreator({
        createdByDisplayName: " ",
        createdByFirstName: " ",
        createdByLastName: " ",
        createdByEmail: " ",
      })
    ).toBe("Unknown");

    expect(formatWorkOrderCreator(null)).toBe("Unknown");
    expect(formatWorkOrderCreator(undefined)).toBe("Unknown");
  });
});
