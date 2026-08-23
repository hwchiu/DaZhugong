const { readStdin, writePrivateFile } = require('./secure-secret-file');

const FIREBASE_ENV_FIELDS = [
  ['apiKey', 'VITE_FIREBASE_API_KEY'],
  ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'VITE_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'VITE_FIREBASE_APP_ID'],
];

function parseFirebaseConfig(input) {
  let config;

  try {
    config = JSON.parse(input);
  } catch {
    throw new Error('FIREBASE_CONFIG must be valid JSON.');
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('FIREBASE_CONFIG must be a JSON object.');
  }

  const missingKeys = FIREBASE_ENV_FIELDS
    .map(([key]) => key)
    .filter((key) => typeof config[key] !== 'string' || config[key].trim() === '');

  if (missingKeys.length > 0) {
    throw new Error(`Missing required Firebase config keys: ${missingKeys.join(', ')}.`);
  }

  return config;
}

function formatEnvValue(value) {
  return /^[A-Za-z0-9._:/-]+$/.test(value) ? value : JSON.stringify(value);
}

function buildFrontendEnv(config) {
  return `${FIREBASE_ENV_FIELDS
    .map(([key, envName]) => `${envName}=${formatEnvValue(config[key])}`)
    .join('\n')}\n`;
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Usage: node scripts/write-frontend-env.js <output-path>');
  }

  const input = await readStdin();
  const config = parseFirebaseConfig(input);
  await writePrivateFile(outputPath, buildFrontendEnv(config));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildFrontendEnv,
  parseFirebaseConfig,
};
