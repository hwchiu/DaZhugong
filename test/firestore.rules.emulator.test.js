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
  deleteDoc,
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

// ---- 申訴功能 ----
// 注意：這裡直接用updateDoc/deleteDoc模擬confirmAppeal()內部transaction實際送出的
// 個別讀寫操作——安全規則是針對「每一個讀寫動作」個別評估的，不管它是不是包在
// transaction裡送出，所以直接測updateDoc/deleteDoc等同於測transaction裡的那幾步。

async function seedAppealFixture(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups/main/members/member1'), {
      authUid: 'uid-1', active: true, name: 'Owner', loginEmail: 'uid-1@dazhugong.invalid',
    });
    await setDoc(doc(db, 'groups/main/members/member2'), {
      authUid: 'uid-2', active: true, name: 'Confirmer2', loginEmail: 'uid-2@dazhugong.invalid',
    });
    await setDoc(doc(db, 'groups/main/members/member3'), {
      authUid: 'uid-3', active: true, name: 'Confirmer3', loginEmail: 'uid-3@dazhugong.invalid',
    });
    await setDoc(doc(db, 'groups/main/members/member4'), {
      authUid: 'uid-4', active: true, name: 'Confirmer4', loginEmail: 'uid-4@dazhugong.invalid',
    });
    await setDoc(doc(db, 'groups/main/reports/report-1'), {
      targetId: 'member1',
      reporterId: 'member2',
      reason: '討論會議',
      timestamp: serverTimestamp(),
    });
  });
}

test('only the record owner can file an appeal on their own record', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);

  const ownerDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, 'groups/main/reports/report-1'), {
    appealedAt: serverTimestamp(),
    appealConfirmedBy: [],
  }));
});

test('a member who is not the record owner cannot file an appeal on someone else\'s record', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);

  const otherDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(updateDoc(doc(otherDb, 'groups/main/reports/report-1'), {
    appealedAt: serverTimestamp(),
    appealConfirmedBy: [],
  }));
});

test('cannot file a second appeal on a record that already has an active appeal', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  const ownerDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, 'groups/main/reports/report-1'), {
    appealedAt: serverTimestamp(),
    appealConfirmedBy: [],
  }));

  await assertFails(updateDoc(doc(ownerDb, 'groups/main/reports/report-1'), {
    appealedAt: serverTimestamp(),
    appealConfirmedBy: [],
  }));
});

test('another member can confirm an active appeal by appending only their own verified identity', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealedAt: serverTimestamp(),
      appealConfirmedBy: [],
    });
  });

  const confirmerDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertSucceeds(updateDoc(doc(confirmerDb, 'groups/main/reports/report-1'), {
    appealConfirmedBy: ['member2'],
  }));
});

test('the record owner cannot confirm their own appeal', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealedAt: serverTimestamp(),
      appealConfirmedBy: [],
    });
  });

  const ownerDb = testEnv.authenticatedContext('uid-1').firestore();
  await assertFails(updateDoc(doc(ownerDb, 'groups/main/reports/report-1'), {
    appealConfirmedBy: ['member1'],
  }));
});

test('a member cannot spoof someone else\'s identity when confirming', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealedAt: serverTimestamp(),
      appealConfirmedBy: [],
    });
  });

  // uid-2登入，卻想蓋member3(自己並不是member3)的確認——必須失敗
  const confirmerDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(updateDoc(doc(confirmerDb, 'groups/main/reports/report-1'), {
    appealConfirmedBy: ['member3'],
  }));
});

test('a member cannot confirm the same appeal twice', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealedAt: serverTimestamp(),
      appealConfirmedBy: ['member2'],
    });
  });

  const confirmerDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(updateDoc(doc(confirmerDb, 'groups/main/reports/report-1'), {
    appealConfirmedBy: ['member2', 'member2'],
  }));
});

test('deleting the report fails with fewer than 3 confirmations, and succeeds once the 3rd is reached', { skip: !shouldRun }, async () => {
  await seedAppealFixture(testEnv);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealedAt: serverTimestamp(),
      appealConfirmedBy: ['member2', 'member3'],
    });
  });

  const tooEarlyDb = testEnv.authenticatedContext('uid-2').firestore();
  await assertFails(deleteDoc(doc(tooEarlyDb, 'groups/main/reports/report-1')));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'groups/main/reports/report-1'), {
      appealConfirmedBy: ['member2', 'member3', 'member4'],
    });
  });

  const confirmerDb = testEnv.authenticatedContext('uid-4').firestore();
  await assertSucceeds(deleteDoc(doc(confirmerDb, 'groups/main/reports/report-1')));
});
