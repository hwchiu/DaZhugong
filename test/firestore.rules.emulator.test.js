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

test('target can still confirm a pending token after the reporter becomes inactive', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: false });
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
});

// ---- 新流程：reporter直接選人+填原因，一次寫入就是confirmed，不經過對方確認 ----
test('reporter directly creates a confirmed token with a reason and matching report atomically', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  const batch = writeBatch(reporterDb);
  const timestamp = serverTimestamp();
  batch.set(doc(reporterDb, 'groups/main/tokens/direct-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    reason: '午餐時間聊了deadline',
    createdAt: timestamp,
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  });
  batch.set(doc(reporterDb, 'groups/main/reports/direct-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    reason: '午餐時間聊了deadline',
    timestamp,
  });

  await assertSucceeds(batch.commit());
});

test('direct-confirm create fails without a matching report in the same batch', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  const timestamp = serverTimestamp();
  await assertFails(setDoc(doc(reporterDb, 'groups/main/tokens/direct-2'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    reason: '沒有搭配report的話應該要失敗',
    createdAt: timestamp,
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  }));
});

test('direct-confirm create fails with an empty or missing reason', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();

  const emptyReasonBatch = writeBatch(reporterDb);
  const emptyTimestamp = serverTimestamp();
  emptyReasonBatch.set(doc(reporterDb, 'groups/main/tokens/direct-empty'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    reason: '',
    createdAt: emptyTimestamp,
    confirmedAt: emptyTimestamp,
    resolvedAt: emptyTimestamp,
  });
  emptyReasonBatch.set(doc(reporterDb, 'groups/main/reports/direct-empty'), {
    targetId: 'member2',
    reporterId: 'member1',
    reason: '',
    timestamp: emptyTimestamp,
  });
  await assertFails(emptyReasonBatch.commit());

  const missingReasonBatch = writeBatch(reporterDb);
  const missingTimestamp = serverTimestamp();
  missingReasonBatch.set(doc(reporterDb, 'groups/main/tokens/direct-missing'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    createdAt: missingTimestamp,
    confirmedAt: missingTimestamp,
    resolvedAt: missingTimestamp,
  });
  missingReasonBatch.set(doc(reporterDb, 'groups/main/reports/direct-missing'), {
    targetId: 'member2',
    reporterId: 'member1',
    timestamp: missingTimestamp,
  });
  await assertFails(missingReasonBatch.commit());
});

test('direct-confirm create fails when the reason exceeds 200 characters', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  const timestamp = serverTimestamp();
  const tooLongReason = 'x'.repeat(201);
  const batch = writeBatch(reporterDb);
  batch.set(doc(reporterDb, 'groups/main/tokens/direct-toolong'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    reason: tooLongReason,
    createdAt: timestamp,
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  });
  batch.set(doc(reporterDb, 'groups/main/reports/direct-toolong'), {
    targetId: 'member2',
    reporterId: 'member1',
    reason: tooLongReason,
    timestamp,
  });
  await assertFails(batch.commit());
});

test('direct-confirm create fails for a spoofed reporterId or a self-targeted report', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();

  // 冒充別人當reporter
  const spoofedTimestamp = serverTimestamp();
  const spoofedBatch = writeBatch(reporterDb);
  spoofedBatch.set(doc(reporterDb, 'groups/main/tokens/direct-spoofed'), {
    targetId: 'member2',
    reporterId: 'member2',
    status: 'confirmed',
    reason: '冒充member2自己回報自己',
    createdAt: spoofedTimestamp,
    confirmedAt: spoofedTimestamp,
    resolvedAt: spoofedTimestamp,
  });
  spoofedBatch.set(doc(reporterDb, 'groups/main/reports/direct-spoofed'), {
    targetId: 'member2',
    reporterId: 'member2',
    reason: '冒充member2自己回報自己',
    timestamp: spoofedTimestamp,
  });
  await assertFails(spoofedBatch.commit());

  // 選自己當違規對象
  const selfTimestamp = serverTimestamp();
  const selfBatch = writeBatch(reporterDb);
  selfBatch.set(doc(reporterDb, 'groups/main/tokens/direct-self'), {
    targetId: 'member1',
    reporterId: 'member1',
    status: 'confirmed',
    reason: '選自己應該要失敗',
    createdAt: selfTimestamp,
    confirmedAt: selfTimestamp,
    resolvedAt: selfTimestamp,
  });
  selfBatch.set(doc(reporterDb, 'groups/main/reports/direct-self'), {
    targetId: 'member1',
    reporterId: 'member1',
    reason: '選自己應該要失敗',
    timestamp: selfTimestamp,
  });
  await assertFails(selfBatch.commit());
});

test('direct-confirm create fails when the target member is inactive', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: false });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  const timestamp = serverTimestamp();
  const batch = writeBatch(reporterDb);
  batch.set(doc(reporterDb, 'groups/main/tokens/direct-inactive-target'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'confirmed',
    reason: '對方已經不是active成員',
    createdAt: timestamp,
    confirmedAt: timestamp,
    resolvedAt: timestamp,
  });
  batch.set(doc(reporterDb, 'groups/main/reports/direct-inactive-target'), {
    targetId: 'member2',
    reporterId: 'member1',
    reason: '對方已經不是active成員',
    timestamp,
  });
  await assertFails(batch.commit());
});

test('legacy pending/confirm/reject flow keeps working unchanged alongside the new direct-confirm path', { skip: !shouldRun }, async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), { authUid: 'uid-1', active: true });
    await setDoc(doc(db, 'groups/main/members/member2'), { authUid: 'uid-2', active: true });
  });

  const reporterDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertSucceeds(setDoc(doc(reporterDb, 'groups/main/tokens/legacy-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    status: 'pending',
    createdAt: serverTimestamp(),
    confirmedAt: null,
    resolvedAt: null,
  }));

  const targetDb = testEnv.authenticatedContext('uid-2').firestore();
  const batch = writeBatch(targetDb);
  batch.update(doc(targetDb, 'groups/main/tokens/legacy-1'), {
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
  });
  batch.set(doc(targetDb, 'groups/main/reports/legacy-1'), {
    targetId: 'member2',
    reporterId: 'member1',
    timestamp: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});
