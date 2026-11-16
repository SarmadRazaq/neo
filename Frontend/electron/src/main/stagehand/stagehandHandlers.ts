/**
 * Stagehand IPC Handlers
 * Handles IPC calls from renderer process for Stagehand operations
 */

import { ipcMain } from 'electron';
import { stagehandManager, StagehandTaskRequest } from './stagehandManager';

/**
 * Setup IPC handlers for Stagehand operations
 */
export function setupStagehandHandlers(): void {
  console.log('[Stagehand] Setting up IPC handlers...');

  // Execute a high-level task
  ipcMain.handle('stagehand:execute-task', async (_event, request: StagehandTaskRequest) => {
    console.log('[Stagehand IPC] execute-task:', request.instruction);
    return await stagehandManager.executeTask(request);
  });

  // Perform a single action
  ipcMain.handle('stagehand:act', async (_event, action: string) => {
    console.log('[Stagehand IPC] act:', action);
    return await stagehandManager.act(action);
  });

  // Extract data from page
  ipcMain.handle('stagehand:extract', async (_event, instruction: string) => {
    console.log('[Stagehand IPC] extract:', instruction);
    return await stagehandManager.extract(instruction);
  });

  // Navigate to URL
  ipcMain.handle('stagehand:navigate', async (_event, url: string) => {
    console.log('[Stagehand IPC] navigate:', url);
    return await stagehandManager.navigate(url);
  });

  // Take screenshot
  ipcMain.handle('stagehand:screenshot', async () => {
    console.log('[Stagehand IPC] screenshot');
    return await stagehandManager.screenshot();
  });

  // Get current URL
  ipcMain.handle('stagehand:get-url', async () => {
    return await stagehandManager.getCurrentUrl();
  });

  // Close Stagehand
  ipcMain.handle('stagehand:close', async () => {
    console.log('[Stagehand IPC] close');
    await stagehandManager.close();
    return { success: true };
  });

  // Cancel current task
  ipcMain.handle('stagehand:cancel', async (_event, reason?: string) => {
    console.log('[Stagehand IPC] cancel:', reason || 'user_interrupted');
    stagehandManager.cancelCurrentTask(reason || 'user_interrupted');
    return { success: true };
  });

  console.log('[Stagehand] IPC handlers registered');
}
