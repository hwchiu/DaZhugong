"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

const {createConfirmTokenHandler} = require("../../src/confirmToken");
const {createLoginWithPinHandler} = require("../../src/loginWithPin");

const PROJECT_ID = "demo-dazhugong";
const NOW_MS = Date.parse("2026-08-23T08:00:00.000Z");
const app = initializeApp({projectId: PROJECT_ID}, "emulator-integration");
const db = getFirestore(app);

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

test.after(async () => {
  await deleteApp(app);
});

test("loginWithPin persists the fifth-failure lock in Firestore", async () => {
  const groupId = "emulator-login-lock";
  const memberRef = db.doc(`groups/${groupId}/members/member1`);
  const authRef = db.doc(`groups/${groupId}/memberAuth/member1`);
  const pinHash = await bcrypt.hash("1234", 4);

  await Promise.all([
    memberRef.set({authUid: "uid-member1"}),
    authRef.set({
      pinHash,
      failedAttempts: 0,
      lockedUntil: null,
      lastFailedAt: null,
      lastSuccessfulAt: null,
    }),
  ]);

  const handler = createLoginWithPinHandler({
    db,
    bcrypt,
    auth: {
      async createCustomToken(uid) {
        return `test-token:${uid}`;
      },
    },
    now: () => Timestamp.fromMillis(NOW_MS),
    fromMillis: (milliseconds) => Timestamp.fromMillis(milliseconds),
  });
  const call = (pin) => handler({
    data: {groupId, memberId: "member1", pin},
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(call("9999"), expectCode("permission-denied"));
    const state = (await authRef.get()).data();
    assert.equal(state.failedAttempts, attempt);
    assert.equal(state.lockedUntil, null);
  }

  await assert.rejects(call("9999"), expectCode("resource-exhausted"));

  const lockedState = (await authRef.get()).data();
  assert.equal(lockedState.failedAttempts, 5);
  assert.equal(
    lockedState.lockedUntil.toMillis(),
    NOW_MS + 15 * 60 * 1000
  );
  await assert.rejects(call("1234"), expectCode("resource-exhausted"));
});

test("confirmToken is concurrent and idempotent in Firestore", async () => {
  const groupId = "emulator-confirm-concurrency";
  const groupRef = db.collection("groups").doc(groupId);
  const targetRef = groupRef.collection("members").doc("member2");
  const tokenRef = groupRef.collection("tokens").doc("token1");

  await Promise.all([
    groupRef.collection("members").doc("member1").set({
      authUid: "uid-1",
      totalTokens: 0,
    }),
    targetRef.set({authUid: "uid-2", totalTokens: 0}),
    tokenRef.set({
      reporterId: "member1",
      targetId: "member2",
      status: "pending",
      createdAt: Timestamp.fromMillis(NOW_MS - 60_000),
      confirmedAt: null,
      resolvedAt: null,
    }),
  ]);

  const handler = createConfirmTokenHandler({
    db,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    increment: (amount) => FieldValue.increment(amount),
  });
  const confirm = () => handler({
    auth: {uid: "uid-2"},
    data: {groupId, tokenId: "token1", action: "confirm"},
  });

  const outcomes = await Promise.allSettled([confirm(), confirm()]);
  assert.equal(outcomes.filter(({status}) => status === "fulfilled").length, 1);
  const rejected = outcomes.find(({status}) => status === "rejected");
  assert.equal(rejected.reason.code, "failed-precondition");

  await assert.rejects(confirm(), expectCode("failed-precondition"));

  const [tokenSnapshot, targetSnapshot, reportSnapshot] = await Promise.all([
    tokenRef.get(),
    targetRef.get(),
    groupRef.collection("reports").doc("token1").get(),
  ]);
  const token = tokenSnapshot.data();
  assert.equal(token.status, "confirmed");
  assert.ok(token.confirmedAt instanceof Timestamp);
  assert.ok(token.resolvedAt instanceof Timestamp);
  assert.equal(targetSnapshot.data().totalTokens, 1);
  assert.equal(reportSnapshot.exists, true);
  assert.ok(reportSnapshot.data().timestamp instanceof Timestamp);
  assert.equal(
    (await groupRef.collection("reports").get()).size,
    1
  );
});
