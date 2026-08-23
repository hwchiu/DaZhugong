"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fft = require("firebase-functions-test")({
  projectId: "demo-dazhugong",
});
const {getAuth} = require("firebase-admin/auth");
const {
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

const functions = require("../../src/index");

const NOW_MS = Date.parse("2026-08-23T08:00:00.000Z");
const db = getFirestore();
const auth = getAuth();
const reportToken = fft.wrap(functions.reportToken);
const confirmToken = fft.wrap(functions.confirmToken);

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

function call(wrapped, data, uid) {
  return wrapped({
    auth: uid ? {uid} : undefined,
    data,
  });
}

async function seedMembers(groupId) {
  const members = [
    ["member1", "uid-member1"],
    ["member2", "uid-member2"],
    ["member3", "uid-member3"],
  ];

  await Promise.all(members.map(([memberId, authUid]) => (
    db.doc(`groups/${groupId}/members/${memberId}`).set({
      authUid,
      totalTokens: 0,
    })
  )));
}

async function seedPendingToken(groupId, totalTokens = 0) {
  await seedMembers(groupId);
  const targetRef = db.doc(`groups/${groupId}/members/member2`);
  await Promise.all([
    targetRef.update({totalTokens}),
    db.doc(`groups/${groupId}/tokens/token1`).set({
      reporterId: "member1",
      targetId: "member2",
      status: "pending",
      createdAt: Timestamp.fromMillis(NOW_MS - 60_000),
      confirmedAt: null,
      resolvedAt: null,
    }),
  ]);
}

test.before(async () => {
  await Promise.all([
    auth.createUser({uid: "uid-member1"}),
    auth.createUser({uid: "uid-member2"}),
    auth.createUser({uid: "uid-member3"}),
  ]);
});

test.after(async () => {
  fft.cleanup();
});

test("successful authenticated report derives the reporter", async () => {
  const groupId = "report-success";
  await seedMembers(groupId);

  const result = await call(
    reportToken,
    {groupId, targetId: "member2"},
    "uid-member1"
  );
  const tokenSnapshot = await db.doc(
    `groups/${groupId}/tokens/${result.tokenId}`
  ).get();

  assert.equal(tokenSnapshot.exists, true);
  assert.deepEqual(
    {
      reporterId: tokenSnapshot.data().reporterId,
      targetId: tokenSnapshot.data().targetId,
      status: tokenSnapshot.data().status,
    },
    {
      reporterId: "member1",
      targetId: "member2",
      status: "pending",
    }
  );
  assert.ok(tokenSnapshot.data().createdAt instanceof Timestamp);
});

test("unauthenticated report is rejected", async () => {
  const groupId = "report-unauthenticated";
  await seedMembers(groupId);

  await assert.rejects(
    call(reportToken, {groupId, targetId: "member2"}),
    expectCode("unauthenticated")
  );
  assert.equal(
    (await db.collection(`groups/${groupId}/tokens`).get()).size,
    0
  );
});

test("only the target can confirm a pending token", async () => {
  const groupId = "confirm-target-only";
  await seedPendingToken(groupId);
  const data = {groupId, tokenId: "token1", action: "confirm"};

  await assert.rejects(
    call(confirmToken, data, "uid-member3"),
    expectCode("permission-denied")
  );
  assert.deepEqual(await call(confirmToken, data, "uid-member2"), {
    success: true,
    status: "confirmed",
  });

  const report = (
    await db.doc(`groups/${groupId}/reports/token1`).get()
  ).data();
  assert.deepEqual(Object.keys(report).sort(), [
    "reporterId",
    "targetId",
    "timestamp",
  ]);
});

test("target can reject a pending token", async () => {
  const groupId = "confirm-reject";
  await seedPendingToken(groupId);

  assert.deepEqual(await call(
    confirmToken,
    {groupId, tokenId: "token1", action: "reject"},
    "uid-member2"
  ), {
    success: true,
    status: "rejected",
  });

  const [tokenSnapshot, targetSnapshot, reportsSnapshot] = await Promise.all([
    db.doc(`groups/${groupId}/tokens/token1`).get(),
    db.doc(`groups/${groupId}/members/member2`).get(),
    db.collection(`groups/${groupId}/reports`).get(),
  ]);
  const token = tokenSnapshot.data();
  assert.equal(token.status, "rejected");
  assert.equal(token.confirmedAt, null);
  assert.ok(token.resolvedAt instanceof Timestamp);
  assert.equal(targetSnapshot.data().totalTokens, 0);
  assert.equal(reportsSnapshot.size, 0);
});

test("duplicate concurrent confirmation increments and reports exactly once", async () => {
  const groupId = "confirm-concurrent";
  await seedPendingToken(groupId, 7);
  const confirm = () => call(
    confirmToken,
    {groupId, tokenId: "token1", action: "confirm"},
    "uid-member2"
  );

  const outcomes = await Promise.allSettled([confirm(), confirm()]);
  const fulfilled = outcomes.filter(({status}) => status === "fulfilled");
  const rejected = outcomes.filter(({status}) => status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.deepEqual(fulfilled[0].value, {
    success: true,
    status: "confirmed",
  });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "failed-precondition");

  const [targetSnapshot, reportsSnapshot] = await Promise.all([
    db.doc(`groups/${groupId}/members/member2`).get(),
    db.collection(`groups/${groupId}/reports`).get(),
  ]);
  assert.equal(targetSnapshot.data().totalTokens, 8);
  assert.equal(reportsSnapshot.size, 1);
  assert.equal(reportsSnapshot.docs[0].id, "token1");
  const report = reportsSnapshot.docs[0].data();
  assert.deepEqual(Object.keys(report).sort(), [
    "reporterId",
    "targetId",
    "timestamp",
  ]);
  assert.equal(report.reporterId, "member1");
  assert.equal(report.targetId, "member2");
  assert.ok(report.timestamp instanceof Timestamp);
});
