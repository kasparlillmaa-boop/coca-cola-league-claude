// Part of `npm run build`: checks the syntax of every .js file in the project.
// A plain JavaScript app has no compile step, so without this the build could never fail.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const folders = ['src', 'scripts', 'test'];

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

let failed = false;
let count = 0;
for (const folder of folders) {
  for (const file of listJsFiles(path.join(root, folder))) {
    count++;
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      failed = true;
      console.error(`Syntax error in ${path.relative(root, file)}:\n${result.stderr}`);
    }
  }
}

if (failed) process.exit(1);
console.log(`Syntax check passed (${count} files).`);
