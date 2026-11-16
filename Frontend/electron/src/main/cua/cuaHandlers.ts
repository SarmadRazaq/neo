/**
 * CUA IPC Handlers
 * Handles IPC communication for CUA operations between renderer and main process
 */

import { ipcMain } from 'electron';
import { browserManager } from './browserManager';
import {
  CUA_IPC_CHANNELS,
  CUAActionResult,
  CUAScreenshotResult,
  CUABrowserState,
} from './types';

/**
 * Setup all CUA IPC handlers
 */
export function setupCUAHandlers(): void {
  // Navigate to URL
  ipcMain.handle(
    CUA_IPC_CHANNELS.NAVIGATE,
    async (_event, url: string): Promise<CUAActionResult> => {
      console.log(`[CUA] Navigate request: ${url}`);
      return await browserManager.navigate(url);
    }
  );

  // Click at coordinates
  ipcMain.handle(
    CUA_IPC_CHANNELS.CLICK,
    async (_event, x: number, y: number): Promise<CUAActionResult> => {
      console.log(`[CUA] Click request: (${x}, ${y})`);
      return await browserManager.click(x, y);
    }
  );

  // Type text
  ipcMain.handle(
    CUA_IPC_CHANNELS.TYPE,
    async (_event, text: string): Promise<CUAActionResult> => {
      console.log(`[CUA] Type request: "${text.substring(0, 30)}..."`);
      return await browserManager.type(text);
    }
  );

  // Press a key
  ipcMain.handle(
    CUA_IPC_CHANNELS.KEY_PRESS,
    async (_event, key: string): Promise<CUAActionResult> => {
      console.log(`[CUA] Key press request: ${key}`);
      return await browserManager.keyPress(key);
    }
  );

  // Scroll
  ipcMain.handle(
    CUA_IPC_CHANNELS.SCROLL,
    async (
      _event,
      direction: 'up' | 'down' | 'left' | 'right',
      amount?: number
    ): Promise<CUAActionResult> => {
      console.log(`[CUA] Scroll request: ${direction} ${amount || 300}px`);
      return await browserManager.scroll(direction, amount);
    }
  );

  // Take screenshot
  ipcMain.handle(
    CUA_IPC_CHANNELS.SCREENSHOT,
    async (_event): Promise<CUAScreenshotResult> => {
      console.log('[CUA] Screenshot request');
      return await browserManager.screenshot();
    }
  );

  // Get browser state
  ipcMain.handle(
    CUA_IPC_CHANNELS.GET_STATE,
    async (_event): Promise<CUABrowserState> => {
      console.log('[CUA] Get state request');
      const [url, title] = await Promise.all([
        browserManager.getCurrentUrl(),
        browserManager.getPageTitle(),
      ]);
      return {
        url,
        title,
        isActive: browserManager.isActive(),
        viewport: browserManager.getViewport(),
      };
    }
  );

  // Close browser
  ipcMain.handle(
    CUA_IPC_CHANNELS.CLOSE_BROWSER,
    async (_event): Promise<void> => {
      console.log('[CUA] Close browser request');
      await browserManager.close();
    }
  );

  console.log('[CUA] IPC handlers registered');
}
