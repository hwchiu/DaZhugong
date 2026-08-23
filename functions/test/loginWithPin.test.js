"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {InMemoryFirestore} = require("./inMemoryFirestore");
const {createLoginWithPinHandler} = require("../src/loginWithPin");

const NOW = new Date("2026-08-23T08:00:00.000Z");

function expectCode(code, message) {
  return (error) => {
    assert.equal(error.code, code);
    if (message) {
      assert.equal(error.message, message);
    }
    return true;
  };
}

async function createFixture(authOverrides = {}, memberOverrides = {}) {
  const pinHash = await bcrypt.hash("1234", 4);
  const db = new InMemoryFirestore({
    "groups/main/members/member1": {
      authUid: "uid-member1",
      name: "Member One",
      ...memberOverrides,
    },
    "groups/main/memberAuth/member1": {
      pinHash,
      failedAttempts: 0,
      lockedUntil: null,
      lastFailedAt: null,
      lastSuccessfulAt: null,
      ...authOverrides,
    },
  });
  const customTokenUids = [];
  const handler = createLoginWithPinHandler({
    db,
    bcrypt,
    auth: {
      async createCustomToken(uid) {
        customTokenUids.push(uid);
        return `custom-token:${uid}`;
      },
    },
    now: () => new Date(NOW),
  });

  return {db, handler, customTokenUids};
}

function login(handler, pin = "1234", extra = {}) {
  return handler({
    data: {groupId: "main", memberId: "member1", pin, ...extra},
  });
}

test("login validates safe identifiers and an exactly four-digit PIN", async () => {
  const {handler} = await createFixture();

  await assert.rejects(
    handler({data: {groupId: "../main", memberId: "member1", pin: "1234"}}),
    expectCode("invalid-argument")
  );
  await assert.rejects(
    handler({data: {groupId: "main", memberId: "member1", pin: "12345"}}),
    expectCode("invalid-argument")
  );
});

test("login creates a custom token for the public member authUid", async () => {
  const {handler, customTokenUids} = await createFixture();

  assert.deepEqual(await login(handler), {
    customToken: "custom-token:uid-member1",
  });
  assert.deepEqual(customTokenUids, ["uid-member1"]);
});

test("wrong PIN increments consecutive failures without revealing the cause", async () => {
  const {db, handler} = await createFixture();

  await assert.rejects(
    login(handler, "9999"),
    expectCode("permission-denied", "Invalid credentials.")
  );

  const authState = db.read("groups/main/memberAuth/member1");
  assert.equal(authState.failedAttempts, 1);
  assert.deepEqual(authState.lastFailedAt, NOW);
  assert.equal(authState.lockedUntil, null);
});

test("the fifth consecutive failure persists the lock and reports exhaustion", async () => {
  const {db, handler} = await createFixture();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(
      login(handler, "9999"),
      expectCode("permission-denied", "Invalid credentials.")
    );
    const authState = db.read("groups/main/memberAuth/member1");
    assert.equal(authState.failedAttempts, attempt);
    assert.deepEqual(authState.lastFailedAt, NOW);
    assert.equal(authState.lockedUntil, null);
  }

  await assert.rejects(
    login(handler, "9999"),
    expectCode("resource-exhausted", "Too many attempts. Try again later.")
  );

  const lockedState = db.read("groups/main/memberAuth/member1");
  assert.equal(lockedState.failedAttempts, 5);
  assert.deepEqual(lockedState.lastFailedAt, NOW);
  assert.deepEqual(
    lockedState.lockedUntil,
    new Date(NOW.getTime() + 15 * 60 * 1000)
  );
});

test("a locked member is rejected even with the correct PIN", async () => {
  const {db, handler, customTokenUids} = await createFixture({
    failedAttempts: 5,
    lockedUntil: new Date(NOW.getTime() + 60_000),
  });

  await assert.rejects(
    login(handler),
    expectCode("resource-exhausted", "Too many attempts. Try again later.")
  );
  assert.equal(db.read("groups/main/memberAuth/member1").failedAttempts, 5);
  assert.deepEqual(customTokenUids, []);
});

test("successful login resets throttle state before token creation", async () => {
  const {db, handler} = await createFixture({
    failedAttempts: 3,
    lockedUntil: new Date(NOW.getTime() - 1),
    lastFailedAt: new Date(NOW.getTime() - 10_000),
  });

  await login(handler);

  const authState = db.read("groups/main/memberAuth/member1");
  assert.equal(authState.failedAttempts, 0);
  assert.equal(authState.lockedUntil, null);
  assert.equal(authState.lastFailedAt, null);
  assert.deepEqual(authState.lastSuccessfulAt, NOW);
});

test("login rejects missing or inconsistent authUid without creating a token", async () => {
  const missing = await createFixture({}, {authUid: undefined});
  await assert.rejects(login(missing.handler), expectCode("permission-denied"));
  assert.deepEqual(missing.customTokenUids, []);

  const inconsistent = await createFixture({authUid: "different-uid"});
  await assert.rejects(login(inconsistent.handler), expectCode("permission-denied"));
  assert.deepEqual(inconsistent.customTokenUids, []);
});

test("login rejects unexpected fields", async () => {
  const {handler} = await createFixture();
  await assert.rejects(
    login(handler, "1234", {reporterId: "member2"}),
    expectCode("invalid-argument")
  );
});
