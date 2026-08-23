"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {InMemoryFirestore} = require("./inMemoryFirestore");
const {createConfirmTokenHandler} = require("../src/confirmToken");

const SERVER_TIME = new Date("2026-08-23T08:00:00.000Z");

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

function createFixture() {
  const db = new InMemoryFirestore({
    "groups/main/members/member1": {authUid: "uid-1", totalTokens: 0},
    "groups/main/members/member2": {authUid: "uid-2", totalTokens: 0},
    "groups/main/members/member3": {authUid: "uid-3", totalTokens: 0},
    "groups/main/tokens/token1": {
      reporterId: "member1",
      targetId: "member2",
      status: "pending",
      createdAt: new Date("2026-08-23T07:00:00.000Z"),
      confirmedAt: null,
    },
  });
  const handler = createConfirmTokenHandler({
    db,
    serverTimestamp: () => new Date(SERVER_TIME),
    increment: (amount) => ({__increment: amount}),
  });
  return {db, handler};
}

function call(handler, uid, action = "confirm", extra = {}) {
  return handler({
    auth: uid ? {uid} : null,
    data: {groupId: "main", tokenId: "token1", action, ...extra},
  });
}

test("confirm requires authentication", async () => {
  const {handler} = createFixture();
  await assert.rejects(call(handler, null), expectCode("unauthenticated"));
});

test("confirm rejects client-supplied identity fields", async () => {
  const {handler} = createFixture();
  await assert.rejects(
    call(handler, "uid-2", "confirm", {memberId: "member1"}),
    expectCode("invalid-argument")
  );
});

test("only the target member can resolve a token", async () => {
  const {db, handler} = createFixture();

  await assert.rejects(
    call(handler, "uid-3"),
    expectCode("permission-denied")
  );
  assert.equal(db.read("groups/main/tokens/token1").status, "pending");
  assert.equal(db.read("groups/main/members/member2").totalTokens, 0);
});

test("target can reject a pending token without incrementing totals", async () => {
  const {db, handler} = createFixture();

  assert.deepEqual(await call(handler, "uid-2", "reject"), {
    status: "rejected",
  });
  assert.deepEqual(db.read("groups/main/tokens/token1"), {
    reporterId: "member1",
    targetId: "member2",
    status: "rejected",
    createdAt: new Date("2026-08-23T07:00:00.000Z"),
    confirmedAt: null,
    resolvedAt: SERVER_TIME,
  });
  assert.equal(db.read("groups/main/members/member2").totalTokens, 0);
  assert.equal(db.list("groups/main/reports/").length, 0);
});

test("confirmation atomically creates one report and increments target once", async () => {
  const {db, handler} = createFixture();

  const outcomes = await Promise.allSettled([
    call(handler, "uid-2"),
    call(handler, "uid-2"),
  ]);

  assert.equal(outcomes.filter(({status}) => status === "fulfilled").length, 1);
  const rejected = outcomes.find(({status}) => status === "rejected");
  assert.equal(rejected.reason.code, "failed-precondition");

  assert.equal(db.read("groups/main/tokens/token1").status, "confirmed");
  assert.deepEqual(
    db.read("groups/main/tokens/token1").confirmedAt,
    SERVER_TIME
  );
  assert.equal(db.read("groups/main/members/member2").totalTokens, 1);
  assert.deepEqual(db.read("groups/main/reports/token1"), {
    tokenId: "token1",
    reporterId: "member1",
    targetId: "member2",
    confirmedAt: SERVER_TIME,
  });
  assert.equal(db.list("groups/main/reports/").length, 1);
});

test("a subsequent confirmation fails with failed-precondition", async () => {
  const {handler} = createFixture();

  await call(handler, "uid-2");
  await assert.rejects(
    call(handler, "uid-2"),
    expectCode("failed-precondition")
  );
});

test("confirm validates action and token identifier", async () => {
  const {handler} = createFixture();

  await assert.rejects(call(handler, "uid-2", "approve"), expectCode("invalid-argument"));
  await assert.rejects(
    handler({
      auth: {uid: "uid-2"},
      data: {groupId: "main", tokenId: "../token1", action: "confirm"},
    }),
    expectCode("invalid-argument")
  );
});
