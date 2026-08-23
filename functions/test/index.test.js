"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("public exports contain only regional v2 callable functions", () => {
  const functions = require("../src/index");

  assert.deepEqual(Object.keys(functions).sort(), [
    "confirmToken",
    "loginWithPin",
    "reportToken",
  ]);

  for (const callable of Object.values(functions)) {
    assert.deepEqual(callable.__endpoint.callableTrigger, {});
    assert.equal(callable.__endpoint.platform, "gcfv2");
    assert.deepEqual(callable.__endpoint.region, ["asia-east1"]);
    assert.equal(callable.__endpoint.callableTrigger.enforceAppCheck, undefined);
  }
});
