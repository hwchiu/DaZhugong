const assert = require('node:assert/strict');
const test = require('node:test');

const { deriveFirebasePassword, deriveLoginEmail } = require('./credentials');

const FIXED_AUTH_UID = 'dazhugong_main_member1';
const FIXED_PIN = '1001';
const FIXED_PASSWORD = 'dazhugong.firebase-auth.v1:dazhugong_main_member1:1001';

test('derives stable Firebase credentials from the fixed vector', () => {
  assert.equal(deriveLoginEmail(FIXED_AUTH_UID), 'dazhugong_main_member1@dazhugong.invalid');
  assert.equal(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_PIN), FIXED_PASSWORD);
  assert.equal(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_PIN), FIXED_PASSWORD);
  assert.ok(FIXED_PASSWORD.length >= 6);
});

test('changes the password when either the member or PIN changes', () => {
  assert.notEqual(
    deriveFirebasePassword('dazhugong_main_member2', FIXED_PIN),
    FIXED_PASSWORD,
  );
  assert.notEqual(
    deriveFirebasePassword(FIXED_AUTH_UID, '1002'),
    FIXED_PASSWORD,
  );
});
