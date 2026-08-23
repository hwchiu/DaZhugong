"use strict";

const {HttpsError} = require("firebase-functions/v2/https");

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function callableError(code, message) {
  return new HttpsError(code, message);
}

function requireAuthentication(request) {
  const uid = request?.auth?.uid;
  if (typeof uid !== "string" || uid.length === 0) {
    throw callableError("unauthenticated", "Authentication is required.");
  }
  return uid;
}

function requireObject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw callableError("invalid-argument", "Invalid request.");
  }
  return data;
}

function requireExactFields(data, allowedFields) {
  requireObject(data);
  const allowed = new Set(allowedFields);
  if (Object.keys(data).some((field) => !allowed.has(field))) {
    throw callableError("invalid-argument", "Invalid request.");
  }
}

function requireIdentifier(value, fieldName) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw callableError("invalid-argument", `Invalid ${fieldName}.`);
  }
  return value;
}

function sanitizeError(error) {
  if (error instanceof HttpsError) {
    return error;
  }
  return callableError("internal", "Unable to complete request.");
}

function createMemberIdentityResolver({db}) {
  if (!db) {
    throw new TypeError("db is required");
  }

  return async function resolveMemberIdentity(request, groupId) {
    const uid = requireAuthentication(request);
    requireIdentifier(groupId, "groupId");

    const snapshot = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .where("authUid", "==", uid)
      .limit(2)
      .get();

    if (snapshot.size !== 1) {
      throw callableError(
        "permission-denied",
        "Authenticated member mapping is invalid."
      );
    }

    const memberSnapshot = snapshot.docs[0];
    const member = memberSnapshot.data();
    if (member.authUid !== uid) {
      throw callableError(
        "permission-denied",
        "Authenticated member mapping is invalid."
      );
    }

    return {id: memberSnapshot.id, ...member};
  };
}

module.exports = {
  callableError,
  createMemberIdentityResolver,
  requireAuthentication,
  requireExactFields,
  requireIdentifier,
  requireObject,
  sanitizeError,
};
