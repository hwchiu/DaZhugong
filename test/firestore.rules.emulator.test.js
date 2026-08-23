const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} = require('firebase/firestore');

const shouldRun = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let testEnv;

test.before(async () => {
  if (!shouldRun) return;
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-dazhugong',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

test.after(async () => {
  await testEnv?.cleanup();
});

test.beforeEach(async () => {
  await testEnv?.clearFirestore();
});

test('public reads work but unauthenticated token writes fail', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'groups/main/members/member1'), {
      authUid: 'uid-1',
      active: true,
      name: 'One',
      loginEmail: 'uid-1@dazhugong.invalid',
    });
  });

  const publicDb = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'groups/main/members/member1')));
  await assertFails(setDoc(doc(publicDb, 'groups/main/tokens/token-1'), {
    targetId: 'member1',
    reporterId: 'member2',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));
});

test('authenticated reporter creates pending token and target confirms with matching report atomically', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), {
      authUid: 'uid-1',
      active: true,
      name: 'One',
      loginEmail: 'uid-1@dazhugong.invalid',
    });
    await setDoc(doc(db, 'groups/main/members/member2'), {
      authUid: 'uid-2',
      active: true,
      name: 'Two',
      loginEmail: 'uid-2@dazhugong.invalid',
    });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertSucceeds(setDoc(doc(reporterDb, 'groups/main/tokens/token-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));

  const targetDb = testEnv.authenticatedContext('uid-2').firestore();
  const batch = writeBatch(targetDb);
  batch.update(doc(targetDb, 'groups/main/tokens/token-1'), {
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
  });
  batch.set(doc(targetDb, 'groups/main/reports/token-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    timestamp: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());

  await assertFails(updateDoc(doc(targetDb, 'groups/main/reports/token-1'), {
    timestamp: serverTimestamp(),
  }));
});

test('confirmation without report and spoofed reporter writes fail', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
    await setDoc(doc(db, 'groups/main/tokens/token-1'), {
      targetId: 'member2',
      reporterId: 'member1',
      status: 'pending',
      createdAt: new Date(),
      confirmedAt: null,
      resolvedAt: null,
    });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertFails(setDoc(doc(reporterDb, 'groups/main/tokens/spoofed'), {
    targetId: 'member2',
    reporterId: 'member2',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));

  const targetDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(updateDoc(doc(targetDb, 'groups/main/tokens/token-1'), {
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
  }));
});

test('inactive members cannot create or resolve tokens and active reporters cannot target them', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: false });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
    await setDoc(doc(db, 'groups/main/tokens/token-1'), {
      targetId: 'member1',
      reporterId: 'member2',
      status: 'pending',
      createdAt: new Date(),
      confirmedAt: null,
      resolvedAt: null,
    });
  });

  const inactiveDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertFails(setDoc(doc(inactiveDb, 'groups/main/tokens/inactive-reporter'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));
  await assertFails(updateDoc(doc(inactiveDb, 'groups/main/tokens/token-1'), {
    status: 'rejected',
    resolvedAt: serverTimestamp(),
  }));

  const activeDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(setDoc(doc(activeDb, 'groups/main/tokens/inactive-target'), {
    targetId: 'member1',
    reporterId: 'member2',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));
});
