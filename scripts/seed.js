const fs = require('node:fs/promises');
const path = require('node:path');

const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then((content) => JSON.parse(content));
}

function normalizeMemberText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateMemberConfig(member, index = 0, seen = { ids: new Set(), authUids: new Set(), pins: new Set() }) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    throw new Error(`Member ${index + 1} must be an object.`);
  }

  const { id, authUid, name, avatar, color, pin } = member;
  const normalizedId = normalizeMemberText(id);
  const normalizedAuthUid = normalizeMemberText(authUid);
  const normalizedName = normalizeMemberText(name);
  const normalizedAvatar = normalizeMemberText(avatar);
  const normalizedColor = normalizeMemberText(color);
  const normalizedPin = String(pin);

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

  if (!/^\d{4}$/.test(normalizedPin)) {
    throw new Error(`Member ${normalizedId} pin must be exactly 4 ASCII digits.`);
  }
  if (seen.pins.has(normalizedPin)) {
    throw new Error(`Member ${normalizedId} pin must be unique.`);
  }
  seen.pins.add(normalizedPin);

  return {
    id: normalizedId,
    authUid: normalizedAuthUid,
    name: normalizedName,
    avatar: normalizedAvatar,
    color: normalizedColor,
    pin: normalizedPin,
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

  const seen = { ids: new Set(), authUids: new Set(), pins: new Set() };
  const normalizedMembers = members.map((member, index) => validateMemberConfig(member, index, seen));

  return {
    groupId: 'main',
    members: normalizedMembers,
  };
}

async function ensureAuthUser(auth, member) {
  try {
    const userRecord = await auth.getUser(member.authUid);
    if (userRecord.displayName !== member.name) {
      await auth.updateUser(member.authUid, { displayName: member.name });
    }
    return userRecord;
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return auth.createUser({
        uid: member.authUid,
        displayName: member.name,
      });
    }
    throw error;
  }
}

async function seed(options = {}) {
  const serviceAccountPath = options.serviceAccountPath || path.join(__dirname, 'serviceAccountKey.json');
  const membersPath = options.membersPath || path.join(__dirname, 'members.local.json');

  const [serviceAccount, seedConfig] = await Promise.all([
    readJson(serviceAccountPath),
    readJson(membersPath),
  ]);

  const { groupId, members } = validateSeedConfig(seedConfig);

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const firestore = admin.firestore();
  const auth = admin.auth();
  const groupRef = firestore.doc(`groups/${groupId}`);

  const memberIds = members.map((member) => member.id);
  await groupRef.set(
    {
      id: groupId,
      memberIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  for (const member of members) {
    await ensureAuthUser(auth, member);

    const memberRef = groupRef.collection('members').doc(member.id);
    const memberSnapshot = await memberRef.get();
    const totalTokens = memberSnapshot.exists && typeof memberSnapshot.get('totalTokens') === 'number'
      ? memberSnapshot.get('totalTokens')
      : 0;

    await memberRef.set(
      {
        authUid: member.authUid,
        name: member.name,
        avatar: member.avatar,
        color: member.color,
        totalTokens,
      },
      { merge: false }
    );

    const memberAuthRef = groupRef.collection('memberAuth').doc(member.id);
    const pinHash = await bcrypt.hash(member.pin, 12);

    await memberAuthRef.set(
      {
        pinHash,
        failedAttempts: 0,
        lockedUntil: null,
        lastFailedAt: null,
        lastSuccessfulAt: null,
      },
      { merge: false }
    );
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
  ensureAuthUser,
  validateMemberConfig,
  seed,
  validateSeedConfig,
};
