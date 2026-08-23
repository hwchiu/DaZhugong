"use strict";

const {
  callableError,
  requireExactFields,
  requireIdentifier,
  requireObject,
  sanitizeError,
} = require("./memberIdentity");

const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function toMillis(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return Number.isFinite(value) ? value : null;
}

function timestampAt(dependencies, milliseconds) {
  if (dependencies.fromMillis) {
    return dependencies.fromMillis(milliseconds);
  }
  return new Date(milliseconds);
}

function createLoginWithPinHandler(dependencies) {
  const {db, bcrypt, auth, now} = dependencies;
  if (!db || !bcrypt || !auth || !now) {
    throw new TypeError("db, bcrypt, auth, and now are required");
  }

  return async function loginWithPinCore(request) {
    try {
      const data = requireObject(request?.data);
      requireExactFields(data, ["groupId", "memberId", "pin"]);
      const groupId = requireIdentifier(data.groupId, "groupId");
      const memberId = requireIdentifier(data.memberId, "memberId");
      if (typeof data.pin !== "string" || !/^\d{4}$/.test(data.pin)) {
        throw callableError("invalid-argument", "PIN must be exactly four digits.");
      }

      const memberRef = db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(memberId);
      const memberAuthRef = db
        .collection("groups")
        .doc(groupId)
        .collection("memberAuth")
        .doc(memberId);

      const result = await db.runTransaction(async (transaction) => {
        const memberSnapshot = await transaction.get(memberRef);
        const authSnapshot = await transaction.get(memberAuthRef);

        if (!memberSnapshot.exists || !authSnapshot.exists) {
          throw callableError("permission-denied", "Invalid credentials.");
        }

        const member = memberSnapshot.data();
        const authState = authSnapshot.data();
        const currentTime = now();
        const currentMillis = toMillis(currentTime);
        const lockedUntilMillis = toMillis(authState.lockedUntil);

        if (
          currentMillis === null ||
          (lockedUntilMillis !== null && lockedUntilMillis > currentMillis)
        ) {
          throw callableError(
            "resource-exhausted",
            "Too many attempts. Try again later."
          );
        }

        let pinMatches = false;
        if (typeof authState.pinHash === "string" && authState.pinHash.length > 0) {
          try {
            pinMatches = await bcrypt.compare(data.pin, authState.pinHash);
          } catch {
            pinMatches = false;
          }
        }

        if (!pinMatches) {
          const failedAttempts = Math.min(
            MAX_FAILURES,
            Math.max(0, Number(authState.failedAttempts) || 0) + 1
          );
          transaction.update(memberAuthRef, {
            failedAttempts,
            lastFailedAt: currentTime,
            lockedUntil:
              failedAttempts >= MAX_FAILURES
                ? timestampAt(dependencies, currentMillis + LOCK_DURATION_MS)
                : null,
          });
          return {
            authenticated: false,
            failureCode:
              failedAttempts >= MAX_FAILURES
                ? "resource-exhausted"
                : "permission-denied",
          };
        }

        const authUid = member.authUid;
        if (
          typeof authUid !== "string" ||
          authUid.length === 0 ||
          authUid.length > 128 ||
          (authState.authUid !== undefined && authState.authUid !== authUid)
        ) {
          throw callableError("permission-denied", "Invalid credentials.");
        }

        transaction.update(memberAuthRef, {
          failedAttempts: 0,
          lockedUntil: null,
          lastFailedAt: null,
          lastSuccessfulAt: currentTime,
        });
        return {authenticated: true, authUid};
      });

      if (!result.authenticated) {
        throw callableError(
          result.failureCode,
          result.failureCode === "resource-exhausted"
            ? "Too many attempts. Try again later."
            : "Invalid credentials."
        );
      }

      const customToken = await auth.createCustomToken(result.authUid);
      return {customToken};
    } catch (error) {
      throw sanitizeError(error);
    }
  };
}

module.exports = {createLoginWithPinHandler};
