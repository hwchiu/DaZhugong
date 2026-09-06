import { describe, expect, it } from 'vitest';
import { getMemberAvatarProfile } from './memberAvatars.js';

describe('getMemberAvatarProfile', () => {
  it('still exposes label and image fields', () => {
    const profile = getMemberAvatarProfile('虎爺');
    expect(profile.label).toBe('虎爺');
    expect(profile.avatar).toBeTruthy();
    expect(profile.full).toBeTruthy();
  });
});
