#!/usr/bin/env node
/**
 * Bundle script for NEO Electron app.
 *
 * Handles Doppler service token automatically:
 *   1. Uses DOPPLER_SERVICE_TOKEN env var if already set.
 *   2. Otherwise, generates a temporary one via the Doppler CLI.
 *
 * Usage:
 *   node scripts/bundle.js [--win] [--mac] [--linux]
 *   (no flag = all platforms)
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

// --------------- helpers ---------------

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function hasDopplerCLI() {
  try {
    execSync('doppler --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// --------------- token ---------------

function getOrCreateToken() {
  // 1. Already provided via env?
  if (process.env.DOPPLER_SERVICE_TOKEN) {
    console.log('[bundle] Using DOPPLER_SERVICE_TOKEN from environment.');
    return process.env.DOPPLER_SERVICE_TOKEN;
  }

  // 2. Generate via CLI
  if (!hasDopplerCLI()) {
    console.error(
      '[bundle] Error: No DOPPLER_SERVICE_TOKEN set and Doppler CLI is not installed.\n' +
      '  Either set DOPPLER_SERVICE_TOKEN or install the Doppler CLI:\n' +
      '  https://docs.doppler.com/docs/install-cli'
    );
    process.exit(1);
  }

  console.log('[bundle] No token found — generating a temporary Doppler service token...');
  try {
    const token = runCapture(
      'doppler configs tokens create --project neo --config prd --name electron-bundle-tmp --max-age 1h --plain'
    );
    if (!token || !token.startsWith('dp.')) {
      throw new Error('Unexpected token format');
    }
    console.log('[bundle] Temporary token created (expires in 1 hour).');
    return token;
  } catch (err) {
    console.error('[bundle] Failed to generate Doppler token:', err.message);
    console.error('  Make sure you are authenticated: doppler login');
    process.exit(1);
  }
}

// --------------- main ---------------

function main() {
  const args = process.argv.slice(2);

  // Determine platform flag
  let platformFlag = '';
  if (args.includes('--win'))   platformFlag = ':win';
  else if (args.includes('--mac'))   platformFlag = ':mac';
  else if (args.includes('--linux')) platformFlag = ':linux';
  // empty = all platforms (uses the base "package" script)

  const token = getOrCreateToken();

  const electronDir = path.resolve(__dirname, '..', 'Frontend', 'electron');
  const scriptName = `package${platformFlag}`;

  console.log(`\n[bundle] Building NEO for ${platformFlag || 'all platforms'}...\n`);

  const result = spawnSync('npm', ['run', scriptName], {
    cwd: electronDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DOPPLER_SERVICE_TOKEN: token },
  });

  if (result.status !== 0) {
    console.error(`\n[bundle] Build failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log('\n[bundle] Done! Installer(s) are in Frontend/electron/release/');
}

main();
