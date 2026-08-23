import { describe, expect, it } from 'vitest';
import { deriveFirebasePassword, deriveLoginEmail } from './credentials.js';

const FIXED_AUTH_UID = 'dazhugong_main_member1';
const FIXED_ACCESS_CODE = 'River!Stone9X';
const FIXED_PASSWORD = 'DzG2!jmaxj7oMt03P8RHcOaVaq84KcTp4VTiqYDc3rp10rRM';

describe('Firebase credential derivation', () => {
  it('matches the seed fixed vector exactly', async () => {
    expect(deriveLoginEmail(FIXED_AUTH_UID)).toBe('dazhugong_main_member1@dazhugong.invalid');
    await expect(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_ACCESS_CODE)).resolves.toBe(FIXED_PASSWORD);
    await expect(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_ACCESS_CODE)).resolves.toBe(FIXED_PASSWORD);
    expect(FIXED_PASSWORD).toMatch(/^DzG2![A-Za-z0-9_-]{43}$/);
    expect(FIXED_PASSWORD).not.toMatch(/River|Stone|member1/);
  });

  it('changes when either credential input changes', async () => {
    await expect(deriveFirebasePassword('dazhugong_main_member2', FIXED_ACCESS_CODE)).resolves.not.toBe(FIXED_PASSWORD);
    await expect(deriveFirebasePassword(FIXED_AUTH_UID, 'River!Stone8X')).resolves.not.toBe(FIXED_PASSWORD);
  });
});
