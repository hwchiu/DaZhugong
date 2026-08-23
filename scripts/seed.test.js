const assert = require('node:assert/strict');
const test = require('node:test');

const { validateSeedConfig } = require('./seed');
const example = require('./members.example.json');

function withPins(config, pins) {
  return {
    ...config,
    members: config.members.map((member, index) => ({
      ...member,
      pin: pins[index],
    })),
  };
}

test('accepts the five-member example after replacing placeholder pins', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);

  const result = validateSeedConfig(config);

  assert.equal(result.groupId, 'main');
  assert.equal(result.members.length, 5);
  assert.deepEqual(
    result.members.map((member) => member.authUid),
    [
      'dazhugong_main_member1',
      'dazhugong_main_member2',
      'dazhugong_main_member3',
      'dazhugong_main_member4',
      'dazhugong_main_member5',
    ]
  );
});

test('rejects invalid pin format', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '12a4']);

  assert.throws(() => validateSeedConfig(config), /pin.*4 digits/i);
});

test('rejects duplicate pin', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1004']);

  assert.throws(() => validateSeedConfig(config), /pin.*unique/i);
});

test('rejects duplicate authUid', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].authUid = config.members[3].authUid;

  assert.throws(() => validateSeedConfig(config), /authUid.*unique/i);
});

test('rejects duplicate member id', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].id = config.members[3].id;

  assert.throws(() => validateSeedConfig(config), /member id.*unique/i);
});

test('rejects missing required display field', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[0].avatar = ' ';

  assert.throws(() => validateSeedConfig(config), /avatar.*non-empty/i);
});
