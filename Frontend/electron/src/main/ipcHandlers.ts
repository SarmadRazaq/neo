/**
 * IPC Handlers
 * Handles IPC communication between main and renderer processes
 */

import { ipcMain, net, BrowserWindow } from 'electron';
import { getOS } from '../lib/os';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getMainConfig } from './config';

const os = getOS();

// LiveKit session response from backend
interface LiveKitSessionResponse {
  roomName: string;
  token: string;
  url: string;
}

// Simple file-based storage for main process
const getStoragePath = (): string => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'storage.json');
};

interface StorageData {
  auth_token?: string;
  [key: string]: string | undefined;
}

const readStorage = (): StorageData => {
  try {
    const storagePath = getStoragePath();
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf-8');
      const parsed = JSON.parse(data) as StorageData;
      return parsed;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error reading storage:', errorMessage);
  }
  return {};
};

const writeStorage = (data: StorageData): void => {
  try {
    const storagePath = getStoragePath();
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error writing storage:', errorMessage);
  }
};

export function setupIpcHandlers(): void {
  // OS operations
  ipcMain.handle('os:open', async (_event, path: string) => {
    try {
      await os.open(path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error opening path:', errorMessage);
      throw error;
    }
  });

  ipcMain.handle('os:showItemInFolder', async (_event, path: string) => {
    try {
      await os.showItemInFolder(path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error showing item in folder:', errorMessage);
      throw error;
    }
  });

  // Voice commands
  ipcMain.handle('voice:start', async () => {
    // Note: Voice recognition in Electron main process would require
    // a different approach (e.g., native modules or external service)
    // For now, this is handled in the renderer process via Web Speech API
    console.log('Voice listening started (handled in renderer)');
  });

  ipcMain.handle('voice:stop', async () => {
    console.log('Voice listening stopped (handled in renderer)');
  });

  // Auth
  ipcMain.handle('auth:getToken', async () => {
    const storage = readStorage();
    return storage.auth_token || null;
  });

  ipcMain.handle('auth:setToken', async (_event, token: string) => {
    const storage = readStorage();
    storage.auth_token = token;
    writeStorage(storage);
  });

  ipcMain.handle('auth:clear', async () => {
    const storage = readStorage();
    delete storage.auth_token;
    writeStorage(storage);
  });

  // Config
  ipcMain.handle('config:getBackendUrl', async () => {
    const config = getMainConfig();
    return config.backendUrl;
  });

  ipcMain.handle('config:isTestingMode', async () => {
    const config = getMainConfig();
    return config.testingMode;
  });

  // Window control (for wake word activation)
  ipcMain.handle('window:show', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
      console.log('[WakeWord] Window restored by wake word');
    }
  });

  // LiveKit - get session from backend (room + token + url)
  ipcMain.handle('livekit:getSession', async (_event, userId?: string): Promise<LiveKitSessionResponse | null> => {
    const config = getMainConfig();

    try {
      const backendUrl = config.backendUrl;
      const sessionUrl = `${backendUrl}/api/v1/livekit/session`;

      console.log(`[LiveKit] Requesting session from: ${sessionUrl}`);

      // Call backend to create session
      const response = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          participantName: 'Neo User',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LiveKit] Backend error: ${response.status} - ${errorText}`);
        return null;
      }

      const session: LiveKitSessionResponse = await response.json();

      console.log(`[LiveKit] Session created: room=${session.roomName}`);

      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LiveKit] Failed to get session from backend:', errorMessage);
      return null;
    }
  });
}

