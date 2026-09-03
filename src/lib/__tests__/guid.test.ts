import { describe, it, expect } from 'vitest';
import { isGuid } from '../guid';

describe('isGuid', () => {
  it('accepts canonical GUIDs in either case', () => {
    expect(isGuid('00000003-0000-0000-c000-000000000000')).toBe(true);
    expect(isGuid('2793995E-0A7D-40D7-BD35-6968BA142197')).toBe(true);
  });

  it('rejects braces, whitespace, special values and near-misses', () => {
    expect(isGuid('{00000003-0000-0000-c000-000000000000}')).toBe(false);
    expect(isGuid(' 00000003-0000-0000-c000-000000000000')).toBe(false);
    expect(isGuid('All')).toBe(false);
    expect(isGuid('00000003-0000-0000-c000-00000000000')).toBe(false);
    expect(isGuid('')).toBe(false);
  });
});
