import { locationRefDoc, locationRefDocId } from '../src/sync/locationRefSync';

describe('location ref sync mapping', () => {
  it('builds deterministic side-collection ids', () => {
    expect(locationRefDocId({ entityType: 'work_order', entityId: 'wo1' })).toBe('work_order__wo1');
    expect(locationRefDocId({ entityType: 'inspection', entityId: 'a/b' })).toBe('inspection__a_b');
  });
  it('maps fields with owner and nulls', () => {
    const d = locationRefDoc({ entityType: 'drive_segment', entityId: 's1' }, { routeId: '12345', roadName: null, beginMp: 1.2, endMp: null, source: null }, { uid: 'u', orgId: 'o' }, 5);
    expect(d).toEqual({ id: 'drive_segment__s1', orgId: 'o', entityType: 'drive_segment', entityId: 's1', routeId: '12345', roadName: null, beginMp: 1.2, endMp: null, source: 'manual', updatedAt: 5, updatedByUid: 'u' });
  });
});
