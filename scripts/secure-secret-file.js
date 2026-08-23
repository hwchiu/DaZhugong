const fs = require('node:fs/promises');

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function writePrivateFile(outputPath, content) {
  await fs.writeFile(outputPath, content, { mode: 0o600 });
  await fs.chmod(outputPath, 0o600);
}

module.exports = {
  readStdin,
  writePrivateFile,
};
