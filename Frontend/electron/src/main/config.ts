/**
 * Main Process Configuration
 * Reads configuration from environment variables (provided by Doppler CLI)
 * 
 * Note: LiveKit credentials (API key, secret, agent name) are now handled
 * by the backend. The frontend only needs the backend URL.
 */

export interface MainProcessConfig {
  backendUrl: string;
  testingMode: boolean;
}

/**
 * Get configuration for main process
 * Environment variables are injected by Doppler CLI
 */
export function getMainConfig(): MainProcessConfig {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const testingMode = process.env.NODE_ENV === 'testing';

  console.log(`[Config] Backend URL: ${backendUrl}`);
  if (testingMode) {
    console.log('[Config] Testing mode: ON (skipping auth & onboarding screens)');
  }

  return {
    backendUrl,
    testingMode,
  };
}

