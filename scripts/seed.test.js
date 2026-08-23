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

function messageFor(fn) {
  try {
    fn();
    assert.fail('Expected function to throw.');
  } catch (error) {
    return error.message;
  }
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

test('normalizes member fields before returning them', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[0] = {
    ...config.members[0],
    id: ' member1 ',
    authUid: ' dazhugong_main_member1 ',
    name: ' 你 ',
    avatar: ' pig ',
    color: ' #FF6B8A ',
    pin: '1001',
  };

  const result = validateSeedConfig(config);

  assert.deepEqual(result.members[0], {
    id: 'member1',
    authUid: 'dazhugong_main_member1',
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
    pin: '1001',
  });
});

test('rejects invalid pin format', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '12a4']);

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /pin.*4 ascii digits/i);
  assert.doesNotMatch(message, /12a4/);
});

test('rejects duplicate pin', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1004']);

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /member member5.*pin.*unique/i);
  assert.doesNotMatch(message, /1004/);
});

test('rejects duplicate authUid', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].authUid = config.members[3].authUid;

  assert.throws(() => validateSeedConfig(config), /authUid.*unique/i);
});

test('rejects duplicate member id', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].id = config.members[3].id;

  assert.throws(() => validateSeedConfig(config), /id.*unique/i);
});

test('rejects trimmed duplicate member id', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].id = ' member4 ';

  assert.throws(() => validateSeedConfig(config), /id.*unique/i);
});

test('rejects trimmed duplicate authUid', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[4].authUid = ' dazhugong_main_member4 ';

  assert.throws(() => validateSeedConfig(config), /authUid.*unique/i);
});

test('rejects numeric PIN collisions', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', 1004]);

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /member member5.*pin.*unique/i);
  assert.doesNotMatch(message, /1004/);
});

test('rejects non-array members', () => {
  assert.throws(() => validateSeedConfig({ members: {} }), /non-empty array/i);
});

test('rejects empty members', () => {
  assert.throws(() => validateSeedConfig({ members: [] }), /non-empty array/i);
});

test('rejects authUid longer than 128 characters', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[0].authUid = `${'a'.repeat(129)}`;

  assert.throws(() => validateSeedConfig(config), /authUid.*128/i);
});

for (const field of ['name', 'avatar', 'color']) {
  test(`rejects missing required display field ${field}`, () => {
    const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
    config.members[0][field] = ' ';

    const message = messageFor(() => validateSeedConfig(config));

    assert.match(message, new RegExp(`${field}.*non-empty`, 'i'));
    assert.doesNotMatch(message, /1001/);
  });
}

test('rejects missing required avatar value with no PIN leakage', () => {
  const config = withPins(example, ['1001', '1002', '1003', '1004', '1005']);
  config.members[0].avatar = '';

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /avatar.*non-empty/i);
  assert.doesNotMatch(message, /1001/);
});
