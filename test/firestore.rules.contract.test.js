const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

test('rules keep public reads and deny group, member, and memberAuth writes', () => {
  assert.match(rules, /match \/groups\/\{groupId\}/);
  assert.match(rules, /match \/members\/\{memberId\}/);
  assert.match(rules, /match \/memberAuth\/\{memberId\}/);
  assert.match(rules, /allow read:\s*if true/);
  assert.match(rules, /memberAuth[\s\S]*allow read, write:\s*if false/);
});

test('rules encode authenticated token transitions and atomic report creation', () => {
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /function memberIsActive\(groupId, memberId\)/);
  assert.match(rules, /function memberExists\(groupId, memberId\)/);
  assert.match(rules, /get\(memberPath\(groupId, memberId\)\)\.data\.active == true/);
  assert.match(rules, /memberIsActive\(groupId, request\.resource\.data\.targetId\)/);
  assert.match(rules, /memberExists\(groupId, resource\.data\.reporterId\)/);
  assert.match(rules, /memberExists\(groupId, request\.resource\.data\.reporterId\)/);
  assert.match(rules, /memberIsActive\(groupId, resource\.data\.targetId\)/);
  assert.match(rules, /data\.keys\(\)\.hasOnly/);
  assert.match(rules, /request\.resource\.data\.createdAt == request\.time/);
  assert.match(rules, /resource\.data\.status == 'pending'/);
  assert.match(rules, /request\.resource\.data\.status == 'confirmed'/);
  assert.match(rules, /request\.resource\.data\.status == 'rejected'/);
  assert.match(rules, /getAfter/);
  assert.match(rules, /request\.resource\.data\.timestamp == request\.time/);
  assert.match(rules, /allow update, delete:\s*if false/);
});
