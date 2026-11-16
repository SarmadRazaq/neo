/**
 * Doppler Secrets Bootstrap
 * 
 * Fetches secrets from Doppler API at runtime using a service token.
 * In development, secrets are injected by `doppler run`, so this is a no-op.
 * In bundled/packaged builds, reads an embedded service token and fetches
 * secrets from the Doppler API before the app initializes.
 */

import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const DOPPLER_API_URL = 'https://api.doppler.com/v3/configs/config/secrets/download?format=json';

/**
 * Read the embedded Doppler service token.
 * 
 * The token is written to `.doppler-token` at build time by the 
 * `prebuild:secrets` script and compiled into the dist/ folder by tsc.
 */
function getEmbeddedToken(): string | null {
  // First check environment (for dev/CI where doppler run injects secrets)
  if (process.env.DOPPLER_SERVICE_TOKEN) {
    return process.env.DOPPLER_SERVICE_TOKEN;
  }

  // Try reading the embedded token file (written at build time)
  try {
    const tokenPath = path.join(__dirname, '.doppler-token');
    const token = fs.readFileSync(tokenPath, 'utf-8').trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Fetch secrets from Doppler API and inject into process.env.
 * 
 * Should be called once at app startup, before any other initialization.
 * In development (when secrets are already in process.env via `doppler run`),
 * this function detects that and skips the fetch.
 */
export async function bootstrapSecrets(): Promise<void> {
  // If we already have secrets from `doppler run` (dev mode), skip
  if (process.env.DOPPLER_CONFIG) {
    console.log('[Secrets] Doppler environment detected (dev mode), skipping API fetch');
    return;
  }

  const token = getEmbeddedToken();

  if (!token) {
    // No token available -- if packaged app, this is a problem
    if (app.isPackaged) {
      console.error('[Secrets] No Doppler service token found in packaged app');
      dialog.showErrorBox(
        'Configuration Error',
        'NEO could not load its configuration. No service token was embedded during build.\n\nPlease contact support.'
      );
      app.exit(1);
    } else {
      console.log('[Secrets] No Doppler token found (development mode without doppler run)');
    }
    return;
  }

  console.log('[Secrets] Fetching secrets from Doppler API...');

  try {
    const response = await fetch(DOPPLER_API_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Doppler API returned ${response.status}: ${errorText}`);
    }

    const secrets: Record<string, string> = await response.json();

    // Inject each secret into process.env
    let count = 0;
    for (const [key, value] of Object.entries(secrets)) {
      // Don't overwrite existing env vars (allows local overrides)
      if (!process.env[key]) {
        process.env[key] = value;
        count++;
      }
    }

    console.log(`[Secrets] Loaded ${count} secrets from Doppler`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Secrets] Failed to fetch secrets from Doppler:', message);

    if (app.isPackaged) {
      dialog.showErrorBox(
        'Connection Error',
        `NEO could not load its configuration from the server.\n\nPlease check your internet connection and try again.\n\nError: ${message}`
      );
      app.exit(1);
    }
  }
}
