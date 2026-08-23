const fs = require('node:fs/promises');
const path = require('node:path');

const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then((content) => JSON.parse(content));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateMemberConfig(member, index = 0, seen = { ids: new Set(), authUids: new Set(), pins: new Set() }) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    throw new Error(`Member ${index + 1} must be an object.`);
  }

  const { id, authUid, name, avatar, color, pin } = member;

  if (!nonEmptyString(id)) {
    throw new Error(`Member ${index + 1} id must be a non-empty string.`);
  }
  if (seen.ids.has(id)) {
    throw new Error(`Member id must be unique: ${id}.`);
  }
  seen.ids.add(id);

  if (!nonEmptyString(authUid) || authUid.trim().length > 128) {
    throw new Error(`Member ${id} authUid must be a non-empty string up to 128 characters.`);
  }
  if (seen.authUids.has(authUid)) {
    throw new Error(`Member authUid must be unique: ${authUid}.`);
  }
  seen.authUids.add(authUid);

  if (!nonEmptyString(name)) {
    throw new Error(`Member ${id} name must be a non-empty string.`);
  }
  if (!nonEmptyString(avatar)) {
    throw new Error(`Member ${id} avatar must be a non-empty string.`);
  }
  if (!nonEmptyString(color)) {
    throw new Error(`Member ${id} color must be a non-empty string.`);
  }

  if (!/^\d{4}$/.test(String(pin || ''))) {
    throw new Error(`Member ${id} pin must be exactly 4 digits.`);
  }
  if (seen.pins.has(pin)) {
    throw new Error(`Member pin must be unique: ${pin}.`);
  }
  seen.pins.add(pin);

  return {
    id: id.trim(),
    authUid: authUid.trim(),
    name: name.trim(),
    avatar: avatar.trim(),
    color: color.trim(),
    pin: String(pin),
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
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ensureAuthUser,
  validateMemberConfig,
  seed,
  validateSeedConfig,
};
