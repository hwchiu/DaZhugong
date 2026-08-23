const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');

const { buildGroupPayload, validateSeedConfig } = require('./seed');
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
  throwOnTotalTokensRead = false,
  onAuthCreateUser,
}) {
  const calls = [];
  const store = new Map();
  const readSnapshots = new Map();

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
      throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    },
    async updateUser(uid, data) {
      calls.push({ type: 'auth.updateUser', uid, data: { ...data } });
    },
    async createUser(data) {
      calls.push({ type: 'auth.createUser', data: { ...data } });
      if (typeof onAuthCreateUser === 'function') {
        onAuthCreateUser({ calls, store, data });
      }
      return { uid: data.uid };
    },
  };

  return { calls, firestore, auth, store };
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

test('preflights all member docs before any auth or writes and aborts on swapped auth UIDs', async () => {
  const { seed } = require('./seed');
  const config = withPins(cloneMembers(2), ['1001', '1002']);
  const seedConfig = {
    members: config.members,
  };
  let releaseSecondGet;
  const secondGetReady = new Promise((resolve) => {
    releaseSecondGet = resolve;
  });

  const harness = createFirestoreHarness({});
  const firestore = {
    ...harness.firestore,
    doc(path) {
      const ref = {
        path,
        async get() {
          harness.calls.push({ type: 'get', path });
          if (path === 'groups/main') {
            return createSnapshot({ name: 'existing group' });
          }
          if (path.endsWith('/member2')) {
            return secondGetReady.then(() => createSnapshot({ authUid: 'dazhugong_main_member1' }));
          }
          return createSnapshot({ authUid: 'dazhugong_main_member2' });
        },
        async set(data, options) {
          harness.calls.push({ type: 'set', path, data: { ...data }, options: options ? { ...options } : undefined });
        },
        collection(name) {
          return {
            doc(id) {
              return firestore.doc(`${path}/${name}/${id}`);
            },
          };
        },
      };
      return ref;
    },
  };
  const fakeFs = {
    async readFile(filePath) {
      if (String(filePath).endsWith('serviceAccountKey.json')) {
        return JSON.stringify({ project_id: 'test' });
      }
      if (String(filePath).endsWith('members.local.json')) {
        return JSON.stringify(seedConfig);
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
    firestore: Object.assign(() => firestore, {
      FieldValue: { serverTimestamp: () => 'server-timestamp' },
    }),
    auth: () => harness.auth,
  };

  const promise = seed({
    serviceAccountPath: '/virtual/serviceAccountKey.json',
    membersPath: '/virtual/members.local.json',
  }, {
    fs: fakeFs,
    admin: fakeAdmin,
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    harness.calls.filter((call) => call.type === 'get' && call.path.includes('/members/')).map((call) => call.path),
    ['groups/main/members/member1', 'groups/main/members/member2']
  );
  assert.equal(
    harness.calls.some((call) => call.type.startsWith('auth.') || call.type === 'set' || call.type === 'create' || call.type === 'update'),
    false
  );

  releaseSecondGet();

  await assert.rejects(promise, /member1/i);

  const errorMessage = await promise.catch((error) => error.message);
  assert.match(errorMessage, /member1/i);
  assert.doesNotMatch(errorMessage, /dazhugong_main_member1|dazhugong_main_member2/);
});

test('preserves existing totalTokens by omitting it from member updates', async () => {
  const { seed } = require('./seed');
  const config = withPins(cloneMembers(1), ['1001']);
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
    name: '你',
    avatar: 'pig',
    color: '#FF6B8A',
  });
  assert.equal('totalTokens' in memberWrite.data, false);
  assert.equal(harness.store.get('groups/main/members/member1').totalTokens, 7);
});

test('creates new member docs with totalTokens initialized to zero without clobbering a concurrent increment', async () => {
  const { seed } = require('./seed');
  const config = withPins(cloneMembers(1), ['1001']);
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

test('initializes new member docs with totalTokens zero when no concurrent write occurs', async () => {
  const { seed } = require('./seed');
  const config = withPins(cloneMembers(1), ['1001']);
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

  assert.equal(harness.store.get('groups/main/members/member1').totalTokens, 0);
  assert.equal(harness.store.get('groups/main/members/member1').authUid, 'dazhugong_main_member1');
});
