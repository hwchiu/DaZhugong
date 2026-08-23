const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const scriptsDirectory = __dirname;
const artifactsDirectory = path.join(scriptsDirectory, '.secret-writer-test');
const firebaseOutput = path.join(artifactsDirectory, '.env.production');
const jsonOutput = path.join(artifactsDirectory, 'members.local.json');

const firebaseConfig = {
  apiKey: 'super-secret-api-key',
  authDomain: 'example.firebaseapp.com',
  projectId: 'example-project',
  storageBucket: 'example.firebasestorage.app',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:secret-app-id',
};

function runScript(scriptName, input, outputPath) {
  return spawnSync(
    process.execPath,
    [path.join(scriptsDirectory, scriptName), outputPath],
    {
      encoding: 'utf8',
      input,
    },
  );
}

test.beforeEach(() => {
  fs.rmSync(artifactsDirectory, { force: true, recursive: true });
  fs.mkdirSync(artifactsDirectory, { recursive: true });
});

test.after(() => {
  fs.rmSync(artifactsDirectory, { force: true, recursive: true });
});

test('writes the complete Firebase config as a private Vite production env file', () => {
  const result = runScript(
    'write-frontend-env.js',
    JSON.stringify(firebaseConfig),
    firebaseOutput,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(
    fs.readFileSync(firebaseOutput, 'utf8'),
    [
      'VITE_FIREBASE_API_KEY=super-secret-api-key',
      'VITE_FIREBASE_AUTH_DOMAIN=example.firebaseapp.com',
      'VITE_FIREBASE_PROJECT_ID=example-project',
      'VITE_FIREBASE_STORAGE_BUCKET=example.firebasestorage.app',
      'VITE_FIREBASE_MESSAGING_SENDER_ID=123456789',
      'VITE_FIREBASE_APP_ID=1:123456789:web:secret-app-id',
      '',
    ].join('\n'),
  );
  assert.equal(fs.statSync(firebaseOutput).mode & 0o777, 0o600);
});

test('reports only missing Firebase key names and never secret values', () => {
  const incompleteConfig = {
    ...firebaseConfig,
    apiKey: 'must-not-appear',
  };
  delete incompleteConfig.appId;

  const result = runScript(
    'write-frontend-env.js',
    JSON.stringify(incompleteConfig),
    firebaseOutput,
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Missing required Firebase config keys: appId\./);
  assert.doesNotMatch(result.stderr, /must-not-appear|super-secret|123456789/);
  assert.equal(fs.existsSync(firebaseOutput), false);
});

test('rejects malformed Firebase JSON without echoing its input', () => {
  const malformedSecret = '{"apiKey":"must-not-appear"';
  const result = runScript(
    'write-frontend-env.js',
    malformedSecret,
    firebaseOutput,
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /FIREBASE_CONFIG must be valid JSON\./);
  assert.doesNotMatch(result.stderr, /must-not-appear/);
});

test('writes an arbitrary JSON object privately without logging its contents', () => {
  const secretObject = {
    members: [{ id: 'member1', pin: '9876' }],
  };
  const result = runScript(
    'write-json-secret.js',
    JSON.stringify(secretObject),
    jsonOutput,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonOutput, 'utf8')), secretObject);
  assert.equal(fs.statSync(jsonOutput).mode & 0o777, 0o600);
});

test('rejects invalid secret JSON without printing private content', () => {
  const result = runScript(
    'write-json-secret.js',
    '{"private_key":"must-not-appear"',
    jsonOutput,
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Secret input must be valid JSON\./);
  assert.doesNotMatch(result.stderr, /must-not-appear/);
  assert.equal(fs.existsSync(jsonOutput), false);
});
