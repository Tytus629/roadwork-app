import { csvEscape, toCsv } from "../src/export/csv";

describe("csvEscape", () => {
  it("returns empty string for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("passes simple strings through", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("123")).toBe("123");
  });

  it("wraps strings with commas in quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("wraps strings with quotes and escapes inner quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps strings with newlines", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("converts numbers to string", () => {
    expect(csvEscape(42)).toBe("42");
  });
});

describe("toCsv", () => {
  it("builds CSV with headers and rows", () => {
    const result = toCsv(["Name", "Age"], [["Alice", 30], ["Bob", 25]]);
    expect(result).toBe("Name,Age\nAlice,30\nBob,25\n");
  });

  it("handles empty rows", () => {
    const result = toCsv(["A"], []);
    expect(result).toBe("A\n\n");
  });

  it("escapes values containing commas", () => {
    const result = toCsv(["Note"], [["hello, world"]]);
    expect(result).toBe('Note\n"hello, world"\n');
  });
});
