const fs = require('node:fs/promises');
const path = require('node:path');

const admin = require('firebase-admin');
const { deriveFirebasePassword, deriveLoginEmail } = require('./credentials');

function readJson(fsModule, filePath) {
  return fsModule.readFile(filePath, 'utf8').then((content) => JSON.parse(content));
}

function normalizeMemberText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateMemberConfig(member, index = 0, seen = { ids: new Set(), authUids: new Set(), accessCodes: new Set() }) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    throw new Error(`Member ${index + 1} must be an object.`);
  }
  if (Object.prototype.hasOwnProperty.call(member, 'pin')) {
    throw new Error(`Member ${index + 1} legacy credential fields are not supported.`);
  }

  const { id, authUid, name, avatar, color, accessCode } = member;
  const normalizedId = normalizeMemberText(id);
  const normalizedAuthUid = normalizeMemberText(authUid);
  const normalizedName = normalizeMemberText(name);
  const normalizedAvatar = normalizeMemberText(avatar);
  const normalizedColor = normalizeMemberText(color);

  if (!normalizedId) {
    throw new Error(`Member ${index + 1} id must be a non-empty string.`);
  }
  if (seen.ids.has(normalizedId)) {
    throw new Error(`Member ${normalizedId} id must be unique.`);
  }
  seen.ids.add(normalizedId);

  if (!normalizedAuthUid || normalizedAuthUid.length > 128) {
    throw new Error(`Member ${normalizedId} authUid must be a non-empty string up to 128 characters.`);
  }
  if (seen.authUids.has(normalizedAuthUid)) {
    throw new Error(`Member ${normalizedId} authUid must be unique.`);
  }
  seen.authUids.add(normalizedAuthUid);

  if (!normalizedName) {
    throw new Error(`Member ${normalizedId} name must be a non-empty string.`);
  }
  if (!normalizedAvatar) {
    throw new Error(`Member ${normalizedId} avatar must be a non-empty string.`);
  }
  if (!normalizedColor) {
    throw new Error(`Member ${normalizedId} color must be a non-empty string.`);
  }

  if (typeof accessCode !== 'string') {
    throw new Error(`Member ${normalizedId} accessCode must be a string.`);
  }
  if (accessCode === '<SET_UNIQUE_ACCESS_CODE>') {
    throw new Error(`Member ${normalizedId} accessCode placeholder must be replaced.`);
  }
  if (accessCode.trim() !== accessCode) {
    throw new Error(`Member ${normalizedId} accessCode must not contain leading or trailing whitespace.`);
  }

  const accessCodeLength = Array.from(accessCode).length;
  const isStrongAccessCode = accessCodeLength >= 12
    && accessCodeLength <= 64
    && /[A-Z]/.test(accessCode)
    && /[a-z]/.test(accessCode)
    && /[0-9]/.test(accessCode)
    && /[^A-Za-z0-9\s]/.test(accessCode);

  if (!isStrongAccessCode) {
    throw new Error(
      `Member ${normalizedId} accessCode must be 12 to 64 characters with uppercase, lowercase, digit, and symbol.`,
    );
  }
  if (seen.accessCodes.has(accessCode)) {
    throw new Error(`Member ${normalizedId} accessCode must be unique.`);
  }
  seen.accessCodes.add(accessCode);

  return {
    id: normalizedId,
    authUid: normalizedAuthUid,
    name: normalizedName,
    avatar: normalizedAvatar,
    color: normalizedColor,
    accessCode,
  };
}

function validateSeedConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Seed config must be an object.');
  }

  const members = config.members;
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('Seed config members must be a non-empty array.');
  }

  const seen = { ids: new Set(), authUids: new Set(), accessCodes: new Set() };
  const normalizedMembers = members.map((member, index) => validateMemberConfig(member, index, seen));

  return {
    groupId: 'main',
    members: normalizedMembers,
  };
}

function buildGroupPayload({ groupId, members, existingGroup = {}, fieldValue = admin.firestore.FieldValue }) {
  return {
    ...existingGroup,
    id: groupId,
    name: '午餐禁公事團',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    memberIds: members.map((member) => member.id),
    updatedAt: fieldValue.serverTimestamp(),
  };
}

function buildMemberPayload(member) {
  return {
    authUid: member.authUid,
    loginEmail: deriveLoginEmail(member.authUid),
    name: member.name,
    avatar: member.avatar,
    color: member.color,
    active: true,
  };
}

async function preflightMemberAuthUids(groupRef, members) {
  const membersRef = groupRef.collection('members');
  const snapshot = await membersRef.get();
  const existingMembers = new Map(snapshot.docs.map((memberSnapshot) => [memberSnapshot.id, memberSnapshot]));
  const configuredIds = new Set(members.map((member) => member.id));

  for (const member of members) {
    const existingMember = existingMembers.get(member.id);
    const existingAuthUid = normalizeMemberText(existingMember?.get('authUid'));

    if (existingAuthUid && existingAuthUid !== member.authUid) {
      throw new Error(`Member ${member.id} authUid does not match configured value.`);
    }
  }

  return {
    memberRefs: members.map((member) => membersRef.doc(member.id)),
    removedMembers: snapshot.docs
      .filter((memberSnapshot) => !configuredIds.has(memberSnapshot.id))
      .map((memberSnapshot) => ({
        id: memberSnapshot.id,
        authUid: normalizeMemberText(memberSnapshot.get('authUid')),
        ref: memberSnapshot.ref,
      })),
  };
}

async function writeMemberDoc(firestore, memberRef, member) {
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(memberRef);
    const payload = buildMemberPayload(member);

    if (snapshot.exists) {
      const existingAuthUid = normalizeMemberText(snapshot.get('authUid'));

      if (!existingAuthUid || existingAuthUid !== member.authUid) {
        throw new Error(`Member ${member.id} authUid does not match configured value.`);
      }

      await transaction.set(memberRef, payload, { merge: true });
      return;
    }

    await transaction.create(memberRef, payload);
  });
}

async function ensureAuthUser(auth, member) {
  const credentials = {
    email: deriveLoginEmail(member.authUid),
    displayName: member.name,
    password: deriveFirebasePassword(member.authUid, member.accessCode),
    disabled: false,
  };

  try {
    await auth.getUser(member.authUid);
    return auth.updateUser(member.authUid, credentials);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return auth.createUser({
        uid: member.authUid,
        ...credentials,
      });
    }
    throw error;
  }
}

async function deactivateMemberDoc(firestore, removedMember) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(removedMember.ref);
    if (!snapshot.exists) {
      return '';
    }

    const currentAuthUid = normalizeMemberText(snapshot.get('authUid'));
    if (currentAuthUid !== removedMember.authUid) {
      throw new Error(`Member ${removedMember.id} authUid changed during offboarding.`);
    }

    await transaction.set(removedMember.ref, { active: false }, { merge: true });
    return currentAuthUid;
  });
}

async function disableAuthUser(auth, authUid) {
  if (!authUid) {
    return;
  }

  try {
    await auth.updateUser(authUid, { disabled: true });
  } catch (error) {
    if (!error || error.code !== 'auth/user-not-found') {
      throw error;
    }
  }
}

async function seed(options = {}, deps = {}) {
  const serviceAccountPath = options.serviceAccountPath || path.join(__dirname, 'serviceAccountKey.json');
  const membersPath = options.membersPath || path.join(__dirname, 'members.local.json');
  const fsModule = deps.fs || fs;
  const adminClient = deps.admin || admin;

  const [serviceAccount, seedConfig] = await Promise.all([
    readJson(fsModule, serviceAccountPath),
    readJson(fsModule, membersPath),
  ]);

  const { groupId, members } = validateSeedConfig(seedConfig);

  if (adminClient.apps.length === 0) {
    adminClient.initializeApp({
      credential: adminClient.credential.cert(serviceAccount),
    });
  }

  const firestore = adminClient.firestore();
  const auth = adminClient.auth();
  const groupRef = firestore.doc(`groups/${groupId}`);
  const groupSnapshot = await groupRef.get();
  const existingGroup = groupSnapshot.exists ? groupSnapshot.data() : {};

  const { removedMembers } = await preflightMemberAuthUids(groupRef, members);
  const configuredAuthUids = new Set(members.map((member) => member.authUid));

  for (const removedMember of removedMembers) {
    const removedAuthUid = await deactivateMemberDoc(firestore, removedMember);
    if (!configuredAuthUids.has(removedAuthUid)) {
      await disableAuthUser(auth, removedAuthUid);
    }
  }

  await groupRef.set(buildGroupPayload({
    groupId,
    members,
    existingGroup,
    fieldValue: adminClient.firestore.FieldValue,
  }), { merge: true });

  for (const member of members) {
    await ensureAuthUser(auth, member);

    const memberRef = groupRef.collection('members').doc(member.id);
    await writeMemberDoc(firestore, memberRef, member);
  }

  return {
    groupId,
    memberCount: members.length,
  };
}

if (require.main === module) {
  seed().then(({ groupId, memberCount }) => {
    console.log(`Seeded ${memberCount} members in groups/${groupId}.`);
  }).catch((error) => {
    console.error(error && typeof error.message === 'string' && /^((Seed config|Member)\b)/.test(error.message)
      ? error.message
      : 'Failed to seed members.');
    process.exitCode = 1;
  });
}

module.exports = {
  buildMemberPayload,
  deactivateMemberDoc,
  disableAuthUser,
  ensureAuthUser,
  validateMemberConfig,
  buildGroupPayload,
  preflightMemberAuthUids,
  writeMemberDoc,
  seed,
  validateSeedConfig,
};
