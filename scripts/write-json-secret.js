const { readStdin, writePrivateFile } = require('./secure-secret-file');

function parseSecretJson(input) {
  let value;

  try {
    value = JSON.parse(input);
  } catch {
    throw new Error('Secret input must be valid JSON.');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Secret input must be a JSON object.');
  }

  return value;
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Usage: node scripts/write-json-secret.js <output-path>');
  }

  const input = await readStdin();
  const value = parseSecretJson(input);
  await writePrivateFile(outputPath, `${JSON.stringify(value)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseSecretJson,
};
