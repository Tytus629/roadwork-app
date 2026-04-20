import { appendSignEntry, normalizeSignEntries } from "../src/utils/signAssetDetails";

describe("signAssetDetails helpers", () => {
  it("normalizes legacy single-sign shape into signs array", () => {
    const entries = normalizeSignEntries({
      signTypeId: "stop",
      signName: "STOP",
      signCode: "R1-1",
    });

    expect(entries).toEqual([
      {
        signTypeId: "stop",
        signLabel: "STOP",
        signCode: "R1-1",
        position: 1,
      },
    ]);
  });

  it("keeps stable order and reindexes positions", () => {
    const entries = normalizeSignEntries({
      signs: [
        { signTypeId: "yield", signLabel: "YIELD", position: 10 },
        { signTypeId: "stop", signLabel: "STOP", position: 2 },
      ],
    });

    expect(entries.map((x) => x.position)).toEqual([1, 2]);
    expect(entries.map((x) => x.signTypeId)).toEqual(["stop", "yield"]);
  });

  it("appends sign entries and mirrors first sign for backward compatibility", () => {
    let details = appendSignEntry(null, {
      signTypeId: "stop",
      signLabel: "STOP",
      signCode: "R1-1",
    });

    details = appendSignEntry(details, {
      signTypeId: "no_parking",
      signLabel: "No Parking",
      signCode: "R7-1",
    });

    const entries = normalizeSignEntries(details);
    expect(entries).toHaveLength(2);
    expect(entries[0].position).toBe(1);
    expect(entries[1].position).toBe(2);

    expect(details.signTypeId).toBe("stop");
    expect(details.signName).toBe("STOP");
    expect(details.signCode).toBe("R1-1");
    expect(details.sign?.signTypeId).toBe("stop");
  });

  it("prevents exact duplicate entry append", () => {
    let details = appendSignEntry(null, {
      signTypeId: "stop",
      signLabel: "STOP",
      signCode: "R1-1",
    });

    details = appendSignEntry(details, {
      signTypeId: "stop",
      signLabel: "STOP",
      signCode: "R1-1",
    });

    const entries = normalizeSignEntries(details);
    expect(entries).toHaveLength(1);
  });
});
