const assert = require('node:assert/strict');
const test = require('node:test');

const { deriveFirebasePassword, deriveLoginEmail } = require('./credentials');

const FIXED_AUTH_UID = 'dazhugong_main_member1';
const FIXED_ACCESS_CODE = 'River!Stone9X';
const FIXED_PASSWORD = 'DzG2!jmaxj7oMt03P8RHcOaVaq84KcTp4VTiqYDc3rp10rRM';

test('derives stable Firebase credentials from the fixed vector', () => {
  assert.equal(deriveLoginEmail(FIXED_AUTH_UID), 'dazhugong_main_member1@dazhugong.invalid');
  assert.equal(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_ACCESS_CODE), FIXED_PASSWORD);
  assert.equal(deriveFirebasePassword(FIXED_AUTH_UID, FIXED_ACCESS_CODE), FIXED_PASSWORD);
  assert.match(FIXED_PASSWORD, /^DzG2![A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(FIXED_PASSWORD, /River|Stone|member1/);
});

test('changes the opaque password when either credential input changes', () => {
  assert.notEqual(
    deriveFirebasePassword('dazhugong_main_member2', FIXED_ACCESS_CODE),
    FIXED_PASSWORD,
  );
  assert.notEqual(
    deriveFirebasePassword(FIXED_AUTH_UID, 'River!Stone8X'),
    FIXED_PASSWORD,
  );
});
