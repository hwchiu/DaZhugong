"use strict";

const {
  callableError,
  createMemberIdentityResolver,
  requireAuthentication,
  requireExactFields,
  requireIdentifier,
  requireObject,
  sanitizeError,
} = require("./memberIdentity");

function createConfirmTokenHandler({db, serverTimestamp, increment}) {
  if (!db || !serverTimestamp || !increment) {
    throw new TypeError("db, serverTimestamp, and increment are required");
  }

  const resolveMemberIdentity = createMemberIdentityResolver({db});

  return async function confirmTokenCore(request) {
    try {
      requireAuthentication(request);
      const data = requireObject(request?.data);
      requireExactFields(data, ["groupId", "tokenId", "action"]);
      const groupId = requireIdentifier(data.groupId, "groupId");
      const tokenId = requireIdentifier(data.tokenId, "tokenId");
      if (data.action !== "confirm" && data.action !== "reject") {
        throw callableError("invalid-argument", "Invalid action.");
      }

      const actor = await resolveMemberIdentity(request, groupId);
      const groupRef = db.collection("groups").doc(groupId);
      const tokenRef = groupRef.collection("tokens").doc(tokenId);

      await db.runTransaction(async (transaction) => {
        const tokenSnapshot = await transaction.get(tokenRef);
        if (!tokenSnapshot.exists) {
          throw callableError("not-found", "Token not found.");
        }

        const token = tokenSnapshot.data();
        if (token.targetId !== actor.id) {
          throw callableError(
            "permission-denied",
            "Only the target member can resolve this token."
          );
        }
        if (token.status !== "pending") {
          throw callableError(
            "failed-precondition",
            "Token has already been resolved."
          );
        }
        if (
          typeof token.reporterId !== "string" ||
          !token.reporterId ||
          typeof token.targetId !== "string" ||
          !token.targetId
        ) {
          throw callableError("failed-precondition", "Token data is invalid.");
        }

        const targetRef = groupRef.collection("members").doc(token.targetId);
        const targetSnapshot = await transaction.get(targetRef);
        if (!targetSnapshot.exists) {
          throw callableError("failed-precondition", "Target member is unavailable.");
        }

        if (data.action === "reject") {
          transaction.update(tokenRef, {
            status: "rejected",
            resolvedAt: serverTimestamp(),
          });
          return;
        }

        transaction.update(tokenRef, {
          status: "confirmed",
          confirmedAt: serverTimestamp(),
        });
        transaction.set(groupRef.collection("reports").doc(tokenId), {
          tokenId,
          reporterId: token.reporterId,
          targetId: token.targetId,
          confirmedAt: serverTimestamp(),
        });
        transaction.update(targetRef, {
          totalTokens: increment(1),
        });
      });

      return {status: data.action === "confirm" ? "confirmed" : "rejected"};
    } catch (error) {
      throw sanitizeError(error);
    }
  };
}

module.exports = {createConfirmTokenHandler};
