/**
 * Patches bundled minimatch inside npm (transitive dep of semantic-release)
 * to resolve GHSA-7r86-cg39-jmmj and GHSA-23c5-xmqv-rm74.
 *
 * npm bundles its own node_modules, so npm overrides can't reach it.
 * This script replaces the bundled minimatch files AND patches the lockfile.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FIXED_VERSION = '10.2.4';
const FIXED_INTEGRITY =
  'sha512-vsBFgptblYk3SADKpDTsHkJl0DJw2P/yXjD4GgZjpDJdZGNiAGpbFm6bvePcp7PCA9YPLzQ3YrN5dRApDoXjg==';
const FIXED_RESOLVED = `https://registry.npmjs.org/minimatch/-/minimatch-${FIXED_VERSION}.tgz`;

const targetDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'npm',
  'node_modules',
  'minimatch'
);

if (!fs.existsSync(targetDir)) {
  process.exit(0);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8')
);

const [major, minor, patch] = pkg.version.split('.').map(Number);

if (major === 10 && (minor < 2 || (minor === 2 && patch <= 2))) {
  console.log(
    `Patching bundled minimatch@${pkg.version} -> ${FIXED_VERSION} (security fix)`
  );

  // 1. Patch the actual files
  const tmpDir = path.join(__dirname, '..', '.minimatch-patch-tmp');
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`npm pack minimatch@${FIXED_VERSION} --pack-destination .`, {
      cwd: tmpDir,
      stdio: 'pipe',
    });

    const tarball = fs
      .readdirSync(tmpDir)
      .find((f) => f.startsWith('minimatch-'));
    execSync(`tar xzf ${tarball}`, { cwd: tmpDir, stdio: 'pipe' });
    fs.cpSync(path.join(tmpDir, 'package'), targetDir, {
      recursive: true,
      force: true,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 2. Patch the lockfile so npm audit sees the fixed version
  const lockPath = path.join(__dirname, '..', 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const key = 'node_modules/npm/node_modules/minimatch';
    if (lock.packages && lock.packages[key]) {
      lock.packages[key].version = FIXED_VERSION;
      lock.packages[key].resolved = FIXED_RESOLVED;
      lock.packages[key].integrity = FIXED_INTEGRITY;
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    }
  }

  console.log('Patched successfully.');
} else {
  console.log(`minimatch@${pkg.version} is not vulnerable, skipping patch.`);
}
