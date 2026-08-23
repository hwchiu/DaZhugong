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

function createReportTokenHandler({db, serverTimestamp}) {
  if (!db || !serverTimestamp) {
    throw new TypeError("db and serverTimestamp are required");
  }

  const resolveMemberIdentity = createMemberIdentityResolver({db});

  return async function reportTokenCore(request) {
    try {
      requireAuthentication(request);
      const data = requireObject(request?.data);
      requireExactFields(data, ["groupId", "targetId"]);
      const groupId = requireIdentifier(data.groupId, "groupId");
      const targetId = requireIdentifier(data.targetId, "targetId");
      const actor = await resolveMemberIdentity(request, groupId);

      if (actor.id === targetId) {
        throw callableError("failed-precondition", "Self-reporting is not allowed.");
      }

      const groupRef = db.collection("groups").doc(groupId);
      const targetSnapshot = await groupRef
        .collection("members")
        .doc(targetId)
        .get();
      if (!targetSnapshot.exists) {
        throw callableError("not-found", "Target member not found.");
      }

      const tokenRef = groupRef.collection("tokens").doc();
      await tokenRef.set({
        reporterId: actor.id,
        targetId,
        status: "pending",
        createdAt: serverTimestamp(),
        confirmedAt: null,
        resolvedAt: null,
      });

      return {tokenId: tokenRef.id};
    } catch (error) {
      throw sanitizeError(error);
    }
  };
}

module.exports = {createReportTokenHandler};
