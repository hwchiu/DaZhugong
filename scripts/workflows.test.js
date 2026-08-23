const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..');

function readWorkflow(name) {
  return fs.readFileSync(
    path.join(repositoryRoot, '.github', 'workflows', name),
    'utf8',
  );
}

test('deploy workflow validates, builds, and deploys only Spark resources', () => {
  const workflow = readWorkflow('deploy.yml');

  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /deploy:\s*\n\s+if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /deploy:\s*\n\s+if: github\.ref == 'refs\/heads\/main'\s*\n\s+environment: production/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /node-version: 22\.12\.0/);
  assert.match(workflow, /distribution: temurin/);
  assert.match(workflow, /java-version: 21/);
  assert.match(workflow, /run: npm ci\b/);
  assert.match(workflow, /run: npm ci --prefix frontend/);
  assert.match(workflow, /run: npm test\b/);
  assert.match(workflow, /run: npm run test:rules:emulator/);
  assert.match(workflow, /run: npm test --prefix frontend/);
  assert.match(workflow, /run: npm run build --prefix frontend/);
  assert.match(workflow, /write-frontend-env\.js frontend\/\.env\.production/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT_DAZHUGONG_4F185/);
  assert.match(workflow, /FIREBASE_TOKEN/);
  assert.match(workflow, /--only "hosting,firestore:rules"/);
  assert.match(workflow, /--project dazhugong-4f185/);
  assert.match(workflow, /--non-interactive/);
  assert.doesNotMatch(workflow, /functions|appcheck/i);
});

test('seed workflow is manual, service-account-only, and always cleans private files', () => {
  const workflow = readWorkflow('seed.yml');

  assert.doesNotMatch(workflow, /\bpush:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /seed:\s*\n\s+if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /seed:\s*\n\s+if: github\.ref == 'refs\/heads\/main'\s*\n\s+environment: production/);
  assert.match(workflow, /node-version: 22\.12\.0/);
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT_DAZHUGONG_4F185/);
  assert.match(workflow, /MEMBERS_CONFIG/);
  assert.match(workflow, /write-json-secret\.js scripts\/members\.local\.json/);
  assert.match(workflow, /write-json-secret\.js scripts\/serviceAccountKey\.json/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /run: npm ci\b/);
  assert.match(workflow, /run: npm run seed\b/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(
    workflow,
    /rm -f scripts\/members\.local\.json scripts\/serviceAccountKey\.json/,
  );
  assert.doesNotMatch(workflow, /FIREBASE_TOKEN/);
});

test('README documents the production environment guardrails', () => {
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');

  assert.match(readme, /GitHub Environment: `production`/);
  assert.match(readme, /Restrict deployment branches to `main`/);
  assert.match(readme, /required reviewers/);
});
