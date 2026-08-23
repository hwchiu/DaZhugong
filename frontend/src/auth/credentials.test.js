import { describe, expect, it } from 'vitest';
import { deriveFirebasePassword, deriveLoginEmail } from './credentials.js';

const FIXED_AUTH_UID = 'dazhugong_main_member1';
const FIXED_PIN = '1001';
const FIXED_PASSWORD = 'dazhugong.firebase-auth.v1:dazhugong_main_member1:1001';

describe('Firebase credential derivation', () => {
  it('matches the seed fixed vector exactly', () => {
    expect(deriveLoginEmail(FIXED_AUTH_UID)).toBe('dazhugong_main_member1@dazhugong.invalid');
    expect(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_PIN)).toBe(FIXED_PASSWORD);
    expect(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_PIN)).toBe(FIXED_PASSWORD);
    expect(FIXED_PASSWORD.length).toBeGreaterThanOrEqual(6);
  });

  it('changes when either the member or PIN changes', () => {
    expect(deriveFirebasePassword('dazhugong_main_member2', FIXED_PIN)).not.toBe(FIXED_PASSWORD);
    expect(deriveFirebasePassword(FIXED_AUTH_UID, '1002')).not.toBe(FIXED_PASSWORD);
  });
});
