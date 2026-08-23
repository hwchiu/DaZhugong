"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {InMemoryFirestore} = require("./inMemoryFirestore");
const {
  createMemberIdentityResolver,
} = require("../src/memberIdentity");

function expectCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

test("member identity requires authentication", async () => {
  const resolveMemberIdentity = createMemberIdentityResolver({
    db: new InMemoryFirestore(),
  });

  await assert.rejects(
    resolveMemberIdentity({auth: null}, "main"),
    expectCode("unauthenticated")
  );
});

test("member identity rejects invalid group identifiers", async () => {
  const resolveMemberIdentity = createMemberIdentityResolver({
    db: new InMemoryFirestore(),
  });

  await assert.rejects(
    resolveMemberIdentity({auth: {uid: "uid-1"}}, "../main"),
    expectCode("invalid-argument")
  );
});

test("member identity rejects missing and ambiguous UID mappings", async () => {
  const missingResolver = createMemberIdentityResolver({
    db: new InMemoryFirestore(),
  });

  await assert.rejects(
    missingResolver({auth: {uid: "uid-1"}}, "main"),
    expectCode("permission-denied")
  );

  const ambiguousResolver = createMemberIdentityResolver({
    db: new InMemoryFirestore({
      "groups/main/members/member1": {authUid: "uid-1"},
      "groups/main/members/member2": {authUid: "uid-1"},
    }),
  });

  await assert.rejects(
    ambiguousResolver({auth: {uid: "uid-1"}}, "main"),
    expectCode("permission-denied")
  );
});

test("member identity returns the unique member mapped from auth UID", async () => {
  const resolveMemberIdentity = createMemberIdentityResolver({
    db: new InMemoryFirestore({
      "groups/main/members/member1": {authUid: "uid-1", name: "One"},
    }),
  });

  assert.deepEqual(
    await resolveMemberIdentity({auth: {uid: "uid-1"}}, "main"),
    {id: "member1", authUid: "uid-1", name: "One"}
  );
});
