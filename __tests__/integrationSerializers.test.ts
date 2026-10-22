import {
  EVENT_COLUMNS, SEGMENT_COLUMNS, WORK_ORDER_COLUMNS,
  csvCell, eventRow, featureCollection, lineGeom, pointGeom, segmentRow, toCsv, workOrderGeom, workOrderRow,
} from '../src/integration/serializers';
import { mergeRef, parseMilepost, resolveRef, setMilepostResolver } from '../src/integration/locationRefs';

/** Minimal RFC 4180 parser to round-trip our output. */
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); out.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  return out;
}

function assertValidGeoJson(fc: any) {
  expect(fc.type).toBe('FeatureCollection');
  for (const f of fc.features) {
    expect(f.type).toBe('Feature');
    expect(typeof f.properties).toBe('object');
    if (f.geometry === null) continue;
    const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
    expect(['Point', 'LineString']).toContain(f.geometry.type);
    if (f.geometry.type === 'LineString') expect(coords.length).toBeGreaterThanOrEqual(2);
    for (const [lng, lat] of coords) {
      expect(lng).toBeGreaterThanOrEqual(-180); expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90); expect(lat).toBeLessThanOrEqual(90);
    }
  }
  expect(() => JSON.parse(JSON.stringify(fc))).not.toThrow();
}

describe('CSV escaping', () => {
  it('quotes commas, quotes, CR and LF; leaves plain values', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('cr\rx')).toBe('"cr\rx"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(-12.5)).toBe('-12.5');
  });
  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1-2')).toBe("'+1-2");
    expect(csvCell('-5')).toBe('-5');
  });
  it('round-trips through an RFC 4180 parser', () => {
    const rows = [{ A: 'x,"y"\nz', B: 1.5, C: null }, { A: 'ok', B: 0, C: true }];
    const parsed = parseCsv(toCsv(['A', 'B', 'C'], rows));
    expect(parsed).toEqual([['A', 'B', 'C'], ['x,"y"\nz', '1.5', ''], ['ok', '0', 'true']]);
  });
});

describe('GeoJSON', () => {
  it('uses [lng, lat] order (EPSG:4326) and rounds to 6 dp', () => {
    expect(pointGeom(47.1234567, -122.7654321)).toEqual({ type: 'Point', coordinates: [-122.765432, 47.123457] });
  });
  it('drops invalid coords, degrades 1-point lines, nulls empty geometry', () => {
    expect(pointGeom(null, 1)).toBeNull();
    expect(pointGeom(95, 1)).toBeNull();
    expect(lineGeom([{ lat: 47, lng: -122 }, { lat: NaN, lng: 0 }])).toEqual({ type: 'Point', coordinates: [-122, 47] });
    expect(lineGeom([])).toBeNull();
  });
  it('builds valid feature collections for all datasets', () => {
    const seg = { id: 's1', sessionId: 'd1', seq: 0, startedAt: 0, endedAt: 7000, path: [{ lat: 47, lng: -122 }, { lat: 47.001, lng: -122 }], lengthM: 111, sampleCount: 700, rmsVertical: 1.2, meanSpeedMps: 13.4, roughnessIndex: 1.2, roughnessClass: 'rough' };
    const ev = { id: 'e1', sessionId: 'd1', occurredAt: 1000, lat: 47, lng: -122, speedMps: 13.4, peakMps2: 9.80665, severity: 'pothole', workOrderId: null };
    const wo = { id: 'w1', type: 'pothole', status: 'Done', priority: 'High', geomType: 'line', line: [{ lat: 47, lng: -122 }, { lat: 47.1, lng: -122.1 }, { lat: 47.2, lng: -122.2 }], createdAt: 0, updatedAt: 86400000, details: { tons: 2.5, materialNote: 'HMA' } };
    const fc = featureCollection('x', [
      { id: seg.id, geometry: lineGeom(seg.path), properties: segmentRow(seg) },
      { id: ev.id, geometry: pointGeom(ev.lat, ev.lng), properties: eventRow(ev) },
      { id: wo.id, geometry: workOrderGeom(wo), properties: workOrderRow(wo) },
      { id: 'nogeom', geometry: null, properties: {} },
    ]);
    assertValidGeoJson(fc);
  });
});

describe('field mapping', () => {
  it('segment row has every column and marks data quality', () => {
    const r = segmentRow({ id: 's', sessionId: 'd', seq: 3, startedAt: Date.UTC(2026, 9, 22), endedAt: Date.UTC(2026, 9, 22) + 7000, path: [{ lat: 1, lng: 2 }, { lat: 1.001, lng: 2 }], lengthM: 100, sampleCount: 1, rmsVertical: 1, meanSpeedMps: 13.4112, roughnessIndex: 1, roughnessClass: 'fair' },
      { routeId: '12345', roadName: 'Main St', beginMp: 1.2, endMp: 1.26, source: 'manual' });
    expect(Object.keys(r).sort()).toEqual([...SEGMENT_COLUMNS].sort());
    expect(r).toMatchObject({ ROUTE_ID: '12345', BEGIN_MP: 1.2, END_MP: 1.26, LENGTH_FT: 328.1, AVG_SPEED_MPH: 30, SURVEY_DATE: '2026-10-22', DATA_QUALITY: 'UNCALIBRATED_SCREENING' });
  });
  it('event row maps severity and g', () => {
    const r = eventRow({ id: 'e', sessionId: 'd', occurredAt: 0, lat: 1, lng: 2, speedMps: null, peakMps2: 19.6133, severity: 'severe', workOrderId: 'w' });
    expect(Object.keys(r).sort()).toEqual([...EVENT_COLUMNS].sort());
    expect(r).toMatchObject({ DISTRESS_TYPE: 'POTHOLE_SUSPECTED', SEVERITY: 'HIGH', PEAK_G: 2, SPEED_MPH: null, WORK_ORDER_ID: 'w' });
  });
  it('work order row maps asset type, activity, status, completion and materials', () => {
    const r = workOrderRow({ id: 'w', type: 'pothole', status: 'Done', priority: 'High', geomType: 'point', lat: 1, lng: 2, createdAt: 0, updatedAt: 1000, details: { tons: 2.5, materialNote: 'HMA' }, assignedToName: 'Kyle' });
    expect(Object.keys(r).sort()).toEqual([...WORK_ORDER_COLUMNS].sort());
    expect(r).toMatchObject({ ASSET_TYPE: 'ROADWAY', ACTIVITY_CODE: 'PAV-POTHOLE', STATUS: 'COMPLETED', PRIORITY: 'HIGH', DATE_COMPLETED: new Date(1000).toISOString(), MATERIAL_QTY: 2.5, MATERIAL_UNIT: 'TON', MATERIAL_DESC: 'HMA', LABOR_HOURS: null, TOTAL_COST: null, ASSIGNED_TO: 'Kyle' });
    expect(workOrderRow({ id: 'x', type: 'sign', status: 'Needs', priority: 'Low', geomType: 'point', createdAt: 0, updatedAt: 0, assetType: 'SIGN', assetId: 'a1' })).toMatchObject({ STATUS: 'OPEN', DATE_COMPLETED: null, ASSET_TYPE: 'SIGN', ASSET_ID: 'a1' });
  });
});

describe('location refs', () => {
  afterEach(() => setMilepostResolver(null));
  it('parses mileposts', () => {
    expect(parseMilepost('MP 12.3456')).toBe(12.346);
    expect(parseMilepost('')).toBeNull();
    expect(parseMilepost('abc')).toBeNull();
    expect(parseMilepost('-1')).toBeNull();
  });
  it('manual wins, resolver fills blanks', () => {
    expect(mergeRef({ routeId: 'R1', roadName: null, beginMp: null, endMp: null, source: 'manual' }, { roadName: 'Main', beginMp: 4 }))
      .toEqual({ routeId: 'R1', roadName: 'Main', beginMp: 4, endMp: null, source: 'manual' });
    setMilepostResolver(() => ({ routeId: 'AUTO', beginMp: 1 }));
    expect(resolveRef('work_order', null, [{ lat: 1, lng: 2 }])).toMatchObject({ routeId: 'AUTO', beginMp: 1, source: 'resolver' });
    setMilepostResolver(() => { throw new Error('boom'); });
    expect(resolveRef('work_order', null, [{ lat: 1, lng: 2 }]).source).toBeNull();
  });
});
