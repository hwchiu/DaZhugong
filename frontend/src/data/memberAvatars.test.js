import { describe, expect, it } from 'vitest';
import {
  applyMemberColorOverride,
  getMemberAvatarProfile,
  getMemberColorOverride,
} from './memberAvatars.js';

describe('getMemberColorOverride', () => {
  it('returns the fixed color for members with a specified brand color', () => {
    expect(getMemberColorOverride('阿龍')).toBe('#eab308');
    expect(getMemberColorOverride('Darren')).toBe('#f97316');
    expect(getMemberColorOverride('牛哥')).toBe('#ec4899');
    expect(getMemberColorOverride('虎爺')).toBe('#2563eb');
    expect(getMemberColorOverride('房產大亨')).toBe('#16a34a');
  });

  it('returns null for a matched member with no specified color (小心肝)', () => {
    expect(getMemberColorOverride('小心肝')).toBe(null);
  });

  it('returns null for names with no avatar profile at all', () => {
    expect(getMemberColorOverride('阿明')).toBe(null);
    expect(getMemberColorOverride(undefined)).toBe(null);
  });
});

describe('applyMemberColorOverride', () => {
  it('overrides the color field for a matched member, keeping other fields intact', () => {
    const member = { id: 'm1', name: '阿龍', color: '#111111', totalTokens: 4 };
    const result = applyMemberColorOverride(member);

    expect(result).toEqual({ id: 'm1', name: '阿龍', color: '#eab308', totalTokens: 4 });
  });

  it('leaves the object unchanged when the member has no color override', () => {
    const member = { id: 'm2', name: '阿明', color: '#111111' };
    const result = applyMemberColorOverride(member);

    expect(result).toBe(member);
  });

  it('leaves the object unchanged for a matched member with no specified color (小心肝)', () => {
    const member = { id: 'm3', name: '小心肝', color: '#123456' };
    const result = applyMemberColorOverride(member);

    expect(result).toBe(member);
    expect(result.color).toBe('#123456');
  });

  it('is a no-op for non-member-like input', () => {
    expect(applyMemberColorOverride(null)).toBe(null);
    expect(applyMemberColorOverride(undefined)).toBe(undefined);
    expect(applyMemberColorOverride('not an object')).toBe('not an object');
  });

  it('falls back to displayName when name is missing', () => {
    const member = { id: 'm4', displayName: 'Darren', color: '#000000' };
    const result = applyMemberColorOverride(member);

    expect(result.color).toBe('#f97316');
  });
});

describe('getMemberAvatarProfile', () => {
  it('still exposes label and image fields alongside the new color field', () => {
    const profile = getMemberAvatarProfile('虎爺');
    expect(profile.label).toBe('虎爺');
    expect(profile.color).toBe('#2563eb');
    expect(profile.avatar).toBeTruthy();
    expect(profile.full).toBeTruthy();
  });
});
