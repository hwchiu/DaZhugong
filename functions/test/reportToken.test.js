"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {InMemoryFirestore} = require("./inMemoryFirestore");
const {createReportTokenHandler} = require("../src/reportToken");

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
  });
  const handler = createReportTokenHandler({
    db,
    serverTimestamp: () => new Date(SERVER_TIME),
  });
  return {db, handler};
}

test("report requires authentication", async () => {
  const {handler} = createFixture();

  await assert.rejects(
    handler({auth: null, data: {groupId: "main", targetId: "member2"}}),
    expectCode("unauthenticated")
  );
});

test("report rejects client-supplied identity fields", async () => {
  const {handler} = createFixture();

  await assert.rejects(
    handler({
      auth: {uid: "uid-1"},
      data: {
        groupId: "main",
        targetId: "member2",
        reporterId: "member2",
      },
    }),
    expectCode("invalid-argument")
  );
});

test("report rejects self-reporting", async () => {
  const {handler} = createFixture();

  await assert.rejects(
    handler({
      auth: {uid: "uid-1"},
      data: {groupId: "main", targetId: "member1"},
    }),
    expectCode("failed-precondition")
  );
});

test("report rejects an invalid or missing target", async () => {
  const {handler} = createFixture();

  await assert.rejects(
    handler({
      auth: {uid: "uid-1"},
      data: {groupId: "main", targetId: "../member2"},
    }),
    expectCode("invalid-argument")
  );
  await assert.rejects(
    handler({
      auth: {uid: "uid-1"},
      data: {groupId: "main", targetId: "missing"},
    }),
    expectCode("not-found")
  );
});

test("report derives reporterId from auth and creates a pending token", async () => {
  const {db, handler} = createFixture();

  const result = await handler({
    auth: {uid: "uid-1"},
    data: {groupId: "main", targetId: "member2"},
  });

  assert.equal(result.tokenId, "auto-1");
  assert.deepEqual(db.read("groups/main/tokens/auto-1"), {
    reporterId: "member1",
    targetId: "member2",
    status: "pending",
    createdAt: SERVER_TIME,
    confirmedAt: null,
  });
});
