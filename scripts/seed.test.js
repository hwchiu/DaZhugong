const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');

const {
  buildGroupPayload,
  buildMemberPayload,
  ensureAuthUser,
  validateSeedConfig,
} = require('./seed');
const example = require('./members.example.json');

const VALID_ACCESS_CODES = [
  'River!Stone9X',
  'Maple#Cloud8Q',
  'Amber$Field7Z',
  'Cedar%Trail6M',
  'Ocean&Bridge5K',
];

function withAccessCodes(config, accessCodes = VALID_ACCESS_CODES) {
  return {
    ...config,
    members: config.members.map((member, index) => ({
      ...member,
      accessCode: accessCodes[index],
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

function cloneMembers(count = example.members.length) {
  return {
    groupId: 'main',
    members: example.members.slice(0, count).map((member) => ({ ...member })),
  };
}

function createSnapshot(data, { throwOnTotalTokensRead = false } = {}) {
  return {
    exists: Boolean(data),
    data: () => (data ? { ...data } : undefined),
    get(field) {
      if (throwOnTotalTokensRead && field === 'totalTokens') {
        throw new Error('totalTokens should not be read');
      }

      return data ? data[field] : undefined;
    },
  };
}

function createFirestoreHarness({
  preflightSnapshots = {},
  existingDocs = {},
  existingAuthUsers = [],
  throwOnTotalTokensRead = false,
  onAuthCreateUser,
}) {
  const calls = [];
  const store = new Map();
  const readSnapshots = new Map();
  const authUsers = new Map(existingAuthUsers.map((user) => [user.uid, { ...user }]));

  for (const [path, data] of Object.entries(existingDocs)) {
    store.set(path, { ...data });
  }

  for (const [path, data] of Object.entries(preflightSnapshots)) {
    readSnapshots.set(path, data);
  }

  function snapshotForStore(path) {
    return createSnapshot(store.get(path), { throwOnTotalTokensRead });
  }

  function snapshotForPreflight(path) {
    if (readSnapshots.has(path)) {
      return createSnapshot(readSnapshots.get(path), { throwOnTotalTokensRead });
    }

    return snapshotForStore(path);
  }

  function applyWrite(path, data, options = {}) {
    const current = store.get(path) || {};

    if (options.merge) {
      store.set(path, { ...current, ...data });
      return;
    }

    store.set(path, { ...data });
  }

  function createDocRef(path) {
    return {
      path,
      async get() {
        calls.push({ type: 'get', path });
        return snapshotForPreflight(path);
      },
      async set(data, options) {
        calls.push({ type: 'set', path, data: { ...data }, options: options ? { ...options } : undefined });
        applyWrite(path, data, options);
      },
      async create(data) {
        calls.push({ type: 'create', path, data: { ...data } });
        store.set(path, { ...data });
      },
      async update(data) {
        calls.push({ type: 'update', path, data: { ...data } });
        applyWrite(path, data, { merge: true });
      },
      collection(name) {
        return createCollectionRef(`${path}/${name}`);
      },
    };
  }

  function createCollectionRef(prefix) {
    return {
      async get() {
        calls.push({ type: 'collection.get', path: prefix });
        const paths = new Set([
          ...[...store.keys()].filter((path) => path.startsWith(`${prefix}/`)),
          ...[...readSnapshots.keys()].filter((path) => path.startsWith(`${prefix}/`)),
        ]);
        const docs = [...paths]
          .filter((path) => !path.slice(prefix.length + 1).includes('/'))
          .sort()
          .map((path) => {
            const data = readSnapshots.has(path) ? readSnapshots.get(path) : store.get(path);
            return {
              id: path.slice(prefix.length + 1),
              ref: createDocRef(path),
              ...createSnapshot(data, { throwOnTotalTokensRead }),
            };
          });
        return { docs };
      },
      doc(id) {
        return createDocRef(`${prefix}/${id}`);
      },
    };
  }

  const firestore = {
    async runTransaction(fn) {
      calls.push({ type: 'runTransaction' });
      const tx = {
        async get(ref) {
          calls.push({ type: 'tx.get', path: ref.path });
          return snapshotForStore(ref.path);
        },
        async set(ref, data, options) {
          calls.push({ type: 'tx.set', path: ref.path, data: { ...data }, options: options ? { ...options } : undefined });
          applyWrite(ref.path, data, options);
        },
        async create(ref, data) {
          calls.push({ type: 'tx.create', path: ref.path, data: { ...data } });
          store.set(ref.path, { ...data });
        },
        async update(ref, data) {
          calls.push({ type: 'tx.update', path: ref.path, data: { ...data } });
          applyWrite(ref.path, data, { merge: true });
        },
      };

      return fn(tx);
    },
    doc(path) {
      return createDocRef(path);
    },
  };

  const auth = {
    async getUser(uid) {
      calls.push({ type: 'auth.getUser', uid });
      if (authUsers.has(uid)) {
        return { ...authUsers.get(uid) };
      }
      throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    },
    async updateUser(uid, data) {
      calls.push({ type: 'auth.updateUser', uid, data: { ...data } });
      authUsers.set(uid, { ...(authUsers.get(uid) || { uid }), ...data });
    },
    async createUser(data) {
      calls.push({ type: 'auth.createUser', data: { ...data } });
      if (typeof onAuthCreateUser === 'function') {
        onAuthCreateUser({ calls, store, data });
      }
      authUsers.set(data.uid, { ...data });
      return { uid: data.uid };
    },
  };

  return { calls, firestore, auth, authUsers, store };
}

async function runSeedWithHarness(config, harness) {
  const { seed } = require('./seed');
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };
  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };

  return seed({
    serviceAccountPath: '/virtual/serviceAccountKey.json',
    membersPath: '/virtual/members.local.json',
  }, {
    fs: fakeFs,
    admin: fakeAdmin,
  });
}

test('accepts the five-member example after replacing placeholder access codes', () => {
  const config = withAccessCodes(example);

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

test('builds the main group payload with lunch metadata and preserves extras', () => {
  const payload = buildGroupPayload({
    groupId: 'main',
    members: [
      { id: 'member1' },
      { id: 'member2' },
    ],
    existingGroup: {
      createdAt: '2026-01-01T00:00:00.000Z',
      theme: 'orange',
    },
  });

  assert.deepEqual(payload, {
    createdAt: '2026-01-01T00:00:00.000Z',
    theme: 'orange',
    id: 'main',
    name: '午餐禁公事團',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    memberIds: ['member1', 'member2'],
    updatedAt: payload.updatedAt,
  });
});

test('public member payload contains login identity and no private credential', () => {
  const member = {
    id: 'member1',
    authUid: 'dazhugong_main_member1',
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
    accessCode: VALID_ACCESS_CODES[0],
  };

  const payload = buildMemberPayload(member);

  assert.deepEqual(payload, {
    authUid: 'dazhugong_main_member1',
    loginEmail: 'dazhugong_main_member1@dazhugong.invalid',
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
    active: true,
  });
  assert.equal('accessCode' in payload, false);
  assert.equal('password' in payload, false);
});

test('creates a missing Auth user with deterministic email and password', async () => {
  const calls = [];
  const auth = {
    async getUser(uid) {
      calls.push({ type: 'getUser', uid });
      throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    },
    async createUser(data) {
      calls.push({ type: 'createUser', data });
      return { uid: data.uid };
    },
  };

  await ensureAuthUser(auth, {
    authUid: 'dazhugong_main_member1',
    name: '你',
    accessCode: VALID_ACCESS_CODES[0],
  });

  assert.deepEqual(calls[1], {
    type: 'createUser',
    data: {
      uid: 'dazhugong_main_member1',
      email: 'dazhugong_main_member1@dazhugong.invalid',
      displayName: '你',
      password: 'DzG2!jmaxj7oMt03P8RHcOaVaq84KcTp4VTiqYDc3rp10rRM',
      disabled: false,
    },
  });
});

test('updates an existing Auth user email, display name, and password', async () => {
  const calls = [];
  const auth = {
    async getUser(uid) {
      calls.push({ type: 'getUser', uid });
      return {
        uid,
        email: 'old@example.invalid',
        displayName: 'Old Name',
      };
    },
    async updateUser(uid, data) {
      calls.push({ type: 'updateUser', uid, data });
      return { uid, ...data };
    },
  };

  await ensureAuthUser(auth, {
    authUid: 'dazhugong_main_member1',
    name: '你',
    accessCode: VALID_ACCESS_CODES[0],
  });

  assert.deepEqual(calls[1], {
    type: 'updateUser',
    uid: 'dazhugong_main_member1',
    data: {
      email: 'dazhugong_main_member1@dazhugong.invalid',
      displayName: '你',
      password: 'DzG2!jmaxj7oMt03P8RHcOaVaq84KcTp4VTiqYDc3rp10rRM',
      disabled: false,
    },
  });
});

test('normalizes member fields before returning them', () => {
  const config = withAccessCodes(example);
  config.members[0] = {
    ...config.members[0],
    id: ' member1 ',
    authUid: ' dazhugong_main_member1 ',
    name: ' 你 ',
    avatar: ' pig ',
    color: ' #FF6B8A ',
    accessCode: VALID_ACCESS_CODES[0],
  };

  const result = validateSeedConfig(config);

  assert.deepEqual(result.members[0], {
    id: 'member1',
    authUid: 'dazhugong_main_member1',
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
    accessCode: VALID_ACCESS_CODES[0],
  });
});

for (const [label, accessCode] of [
  ['shorter than 12 characters', 'Short!Code9'],
  ['longer than 64 characters', `Aa1!${'x'.repeat(61)}`],
  ['without an uppercase letter', 'lower!case123'],
  ['without a lowercase letter', 'UPPER!CASE123'],
  ['without a digit', 'Missing!DigitX'],
  ['without a symbol', 'MissingSymbol9X'],
]) {
  test(`rejects an access code ${label}`, () => {
    const config = withAccessCodes(example);
    config.members[4].accessCode = accessCode;

    const message = messageFor(() => validateSeedConfig(config));

    assert.match(message, /accessCode.*12.*64.*uppercase.*lowercase.*digit.*symbol/i);
    assert.doesNotMatch(message, new RegExp(accessCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

test('rejects leading or trailing whitespace instead of trimming an access code', () => {
  for (const accessCode of [` ${VALID_ACCESS_CODES[4]}`, `${VALID_ACCESS_CODES[4]} `]) {
    const config = withAccessCodes(example);
    config.members[4].accessCode = accessCode;

    const message = messageFor(() => validateSeedConfig(config));

    assert.match(message, /accessCode.*leading or trailing whitespace/i);
    assert.doesNotMatch(message, new RegExp(VALID_ACCESS_CODES[4].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('rejects the documented access-code placeholder', () => {
  const message = messageFor(() => validateSeedConfig(example));

  assert.match(message, /accessCode.*placeholder/i);
  assert.doesNotMatch(message, /SET_UNIQUE_ACCESS_CODE/);
});

test('rejects duplicate access codes using exact untrimmed values', () => {
  const config = withAccessCodes(example);
  config.members[4].accessCode = VALID_ACCESS_CODES[3];

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /member member5.*accessCode.*unique/i);
  assert.doesNotMatch(message, new RegExp(VALID_ACCESS_CODES[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('rejects the removed legacy credential field', () => {
  const config = withAccessCodes(example);
  config.members[0].pin = '1234';

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /legacy.*credential.*not supported/i);
  assert.doesNotMatch(message, /1234/);
});

test('rejects duplicate authUid', () => {
  const config = withAccessCodes(example);
  config.members[4].authUid = config.members[3].authUid;

  assert.throws(() => validateSeedConfig(config), /authUid.*unique/i);
});

test('rejects duplicate member id', () => {
  const config = withAccessCodes(example);
  config.members[4].id = config.members[3].id;

  assert.throws(() => validateSeedConfig(config), /id.*unique/i);
});

test('rejects trimmed duplicate member id', () => {
  const config = withAccessCodes(example);
  config.members[4].id = ' member4 ';

  assert.throws(() => validateSeedConfig(config), /id.*unique/i);
});

test('rejects trimmed duplicate authUid', () => {
  const config = withAccessCodes(example);
  config.members[4].authUid = ' dazhugong_main_member4 ';

  assert.throws(() => validateSeedConfig(config), /authUid.*unique/i);
});

test('rejects non-string access codes rather than coercing them', () => {
  const config = withAccessCodes(example);
  config.members[4].accessCode = 123456789012;

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /member member5.*accessCode.*string/i);
  assert.doesNotMatch(message, /123456789012/);
});

test('rejects non-array members', () => {
  assert.throws(() => validateSeedConfig({ members: {} }), /non-empty array/i);
});

test('rejects empty members', () => {
  assert.throws(() => validateSeedConfig({ members: [] }), /non-empty array/i);
});

test('rejects authUid longer than 128 characters', () => {
  const config = withAccessCodes(example);
  config.members[0].authUid = `${'a'.repeat(129)}`;

  assert.throws(() => validateSeedConfig(config), /authUid.*128/i);
});

for (const field of ['name', 'avatar', 'color']) {
  test(`rejects missing required display field ${field}`, () => {
    const config = withAccessCodes(example);
    config.members[0][field] = ' ';

    const message = messageFor(() => validateSeedConfig(config));

    assert.match(message, new RegExp(`${field}.*non-empty`, 'i'));
    assert.doesNotMatch(message, /River|Stone/);
  });
}

test('rejects missing required avatar value with no access-code leakage', () => {
  const config = withAccessCodes(example);
  config.members[0].avatar = '';

  const message = messageFor(() => validateSeedConfig(config));

  assert.match(message, /avatar.*non-empty/i);
  assert.doesNotMatch(message, /River|Stone/);
});

test('preflights all member docs before any auth or writes and aborts on swapped auth UIDs', async () => {
  const { seed } = require('./seed');
  const config = withAccessCodes(cloneMembers(2));
  const harness = createFirestoreHarness({
    preflightSnapshots: {
      'groups/main/members/member1': { authUid: 'dazhugong_main_member2' },
      'groups/main/members/member2': { authUid: 'dazhugong_main_member1' },
    },
    existingDocs: {
      'groups/main': { name: 'existing group' },
    },
  });
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };
  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };

  await assert.rejects(
    seed({
      serviceAccountPath: '/virtual/serviceAccountKey.json',
      membersPath: '/virtual/members.local.json',
    }, {
      fs: fakeFs,
      admin: fakeAdmin,
    }),
    /member1/i
  );

  assert.deepEqual(
    harness.calls.filter((call) => call.type === 'collection.get').map((call) => call.path),
    ['groups/main/members']
  );
  assert.equal(
    harness.calls.some((call) => call.type.startsWith('auth.') || call.type === 'set' || call.type === 'create' || call.type === 'update'),
    false
  );
});

test('offboards omitted members without deleting their documents, reports, or tokens', async () => {
  const config = withAccessCodes(cloneMembers(1));
  const removedAuthUid = 'dazhugong_main_member2';
  const harness = createFirestoreHarness({
    existingDocs: {
      'groups/main': { name: 'existing group' },
      'groups/main/members/member1': {
        authUid: 'dazhugong_main_member1',
        active: true,
      },
      'groups/main/members/member2': {
        authUid: removedAuthUid,
        active: true,
        name: 'Former Member',
        totalTokens: 9,
      },
      'groups/main/reports/report-1': {
        targetId: 'member2',
        reporterId: 'member1',
      },
      'groups/main/tokens/token-1': {
        targetId: 'member2',
        reporterId: 'member1',
        status: 'confirmed',
      },
    },
    existingAuthUsers: [
      { uid: 'dazhugong_main_member1', disabled: false },
      { uid: removedAuthUid, disabled: false },
    ],
  });

  await runSeedWithHarness(config, harness);

  assert.deepEqual(harness.store.get('groups/main/members/member2'), {
    authUid: removedAuthUid,
    active: false,
    name: 'Former Member',
    totalTokens: 9,
  });
  assert.equal(harness.authUsers.get(removedAuthUid).disabled, true);
  assert.ok(harness.store.has('groups/main/reports/report-1'));
  assert.ok(harness.store.has('groups/main/tokens/token-1'));
});

test('reactivates a configured member and enables Auth while updating credentials', async () => {
  const config = withAccessCodes(cloneMembers(1));
  const authUid = 'dazhugong_main_member1';
  const harness = createFirestoreHarness({
    existingDocs: {
      'groups/main': { name: 'existing group' },
      'groups/main/members/member1': {
        authUid,
        active: false,
        name: 'Former Name',
        totalTokens: 4,
      },
    },
    existingAuthUsers: [
      {
        uid: authUid,
        disabled: true,
        email: 'old@example.invalid',
        displayName: 'Former Name',
      },
    ],
  });

  await runSeedWithHarness(config, harness);

  assert.equal(harness.store.get('groups/main/members/member1').active, true);
  assert.equal(harness.store.get('groups/main/members/member1').totalTokens, 4);
  assert.deepEqual(
    harness.calls.find((call) => call.type === 'auth.updateUser' && call.uid === authUid),
    {
      type: 'auth.updateUser',
      uid: authUid,
      data: {
        email: 'dazhugong_main_member1@dazhugong.invalid',
        displayName: '你',
        password: 'DzG2!jmaxj7oMt03P8RHcOaVaq84KcTp4VTiqYDc3rp10rRM',
        disabled: false,
      },
    }
  );
});

test('never disables a configured Auth UID reused by an omitted member document', async () => {
  const config = withAccessCodes(cloneMembers(1));
  const configuredAuthUid = 'dazhugong_main_member1';
  const harness = createFirestoreHarness({
    existingDocs: {
      'groups/main': { name: 'existing group' },
      'groups/main/members/member1': {
        authUid: configuredAuthUid,
        active: true,
      },
      'groups/main/members/legacy-duplicate': {
        authUid: configuredAuthUid,
        active: true,
        name: 'Legacy Duplicate',
      },
    },
    existingAuthUsers: [
      { uid: configuredAuthUid, disabled: false },
    ],
  });

  await runSeedWithHarness(config, harness);

  assert.equal(harness.store.get('groups/main/members/legacy-duplicate').active, false);
  assert.equal(
    harness.calls.some((call) =>
      call.type === 'auth.updateUser'
      && call.uid === configuredAuthUid
      && call.data.disabled === true),
    false
  );
});

test('preserves existing totalTokens by omitting it from member updates', async () => {
  const { seed } = require('./seed');
  const config = withAccessCodes(cloneMembers(1));
  const harness = createFirestoreHarness({
    preflightSnapshots: {
      'groups/main/members/member1': {
        authUid: 'dazhugong_main_member1',
        totalTokens: 7,
      },
    },
    existingDocs: {
      'groups/main': { name: 'existing group' },
      'groups/main/members/member1': {
        authUid: 'dazhugong_main_member1',
        name: 'Old Name',
        avatar: 'old-avatar',
        color: '#111111',
        totalTokens: 7,
      },
    },
    throwOnTotalTokensRead: true,
  });

  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };

  await seed({
    serviceAccountPath: '/virtual/serviceAccountKey.json',
    membersPath: '/virtual/members.local.json',
  }, {
    fs: fakeFs,
    admin: fakeAdmin,
  });

  const memberWrite = harness.calls.find((call) => call.path === 'groups/main/members/member1' && (call.type === 'set' || call.type === 'tx.set' || call.type === 'create' || call.type === 'tx.create' || call.type === 'update' || call.type === 'tx.update'));
  assert.ok(memberWrite, 'Expected a member write.');
  assert.deepEqual(memberWrite.data, {
    authUid: 'dazhugong_main_member1',
    loginEmail: 'dazhugong_main_member1@dazhugong.invalid',
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
    active: true,
  });
  assert.equal('totalTokens' in memberWrite.data, false);
  assert.equal(harness.store.get('groups/main/members/member1').totalTokens, 7);
});

test('merges a concurrently created member without clobbering its legacy totalTokens', async () => {
  const { seed } = require('./seed');
  const config = withAccessCodes(cloneMembers(1));
  const harness = createFirestoreHarness({
    preflightSnapshots: {
      'groups/main/members/member1': null,
    },
    onAuthCreateUser({ store }) {
      store.set('groups/main/members/member1', {
        authUid: 'dazhugong_main_member1',
        name: 'Concurrent Name',
        avatar: 'existing-avatar',
        color: '#222222',
        totalTokens: 5,
      });
    },
  });

  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };

  await seed({
    serviceAccountPath: '/virtual/serviceAccountKey.json',
    membersPath: '/virtual/members.local.json',
  }, {
    fs: fakeFs,
    admin: fakeAdmin,
  });

  assert.equal(harness.store.get('groups/main/members/member1').totalTokens, 5);
  assert.equal(harness.store.get('groups/main/members/member1').authUid, 'dazhugong_main_member1');
  assert.ok(harness.calls.some((call) => call.type === 'runTransaction' || call.type === 'tx.create' || call.type === 'tx.update'));
});

test('creates new member docs without a denormalized totalTokens field', async () => {
  const { seed } = require('./seed');
  const config = withAccessCodes(cloneMembers(1));
  const harness = createFirestoreHarness({
    preflightSnapshots: {
      'groups/main/members/member1': null,
    },
  });

  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };

  await seed({
    serviceAccountPath: '/virtual/serviceAccountKey.json',
    membersPath: '/virtual/members.local.json',
  }, {
    fs: fakeFs,
    admin: fakeAdmin,
  });

  assert.equal('totalTokens' in harness.store.get('groups/main/members/member1'), false);
  assert.equal(harness.store.get('groups/main/members/member1').authUid, 'dazhugong_main_member1');
  assert.equal(
    harness.calls.some((call) => call.path?.includes('/memberAuth/')),
    false,
  );
});

test('aborts member merge when the transaction snapshot authUid changed after preflight', async () => {
  const { seed } = require('./seed');
  const config = withAccessCodes(cloneMembers(1));
  const harness = createFirestoreHarness({
    preflightSnapshots: {
      'groups/main/members/member1': {
        authUid: 'dazhugong_main_member1',
      },
    },
    existingDocs: {
      'groups/main': { name: 'existing group' },
      'groups/main/members/member1': {
        authUid: 'unexpected-auth-uid',
        name: 'Existing Name',
        avatar: 'existing-avatar',
        color: '#111111',
        totalTokens: 7,
      },
    },
  });

  const fakeAdmin = {
    apps: [],
    initializeApp() {
      harness.calls.push({ type: 'initializeApp' });
    },
    credential: {
      cert(serviceAccount) {
        harness.calls.push({ type: 'credential.cert', serviceAccount: { ...serviceAccount } });
        return { serviceAccount };
      },
    },
    firestore: Object.assign(() => harness.firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify({ members: config.members });
      }
      return fs.readFile(filePath, 'utf8');
    },
  };

  await assert.rejects(
    seed({
      serviceAccountPath: '/virtual/serviceAccountKey.json',
      membersPath: '/virtual/members.local.json',
    }, {
      fs: fakeFs,
      admin: fakeAdmin,
    }),
    /authUid/i
  );

  assert.equal(harness.store.get('groups/main/members/member1').authUid, 'unexpected-auth-uid');
  assert.equal(harness.calls.some((call) => call.type === 'tx.set' && call.path === 'groups/main/members/member1'), false);
  assert.equal(harness.calls.some((call) => call.type === 'tx.create' && call.path === 'groups/main/members/member1'), false);
});
