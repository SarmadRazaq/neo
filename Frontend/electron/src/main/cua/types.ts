/**
 * CUA (Computer Use Agent) Types
 * Shared type definitions for CUA operations
 */

// Commands received from backend via LiveKit data channel
export interface CUACommand {
  type: CUACommandType;
  // Navigate
  url?: string;
  // Click
  x?: number;
  y?: number;
  // Type
  text?: string;
  // Key press
  key?: string;
  // Scroll
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  // Metadata
  timestamp: string;
  requestId?: string; // For correlating responses
}

export type CUACommandType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'key_press'
  | 'scroll'
  | 'screenshot'
  | 'get_browser_state';

// Response sent back to backend
export interface CUAResponse {
  type: 'cua_result';
  success: boolean;
  commandType: CUACommandType;
  requestId?: string;
  error?: string;
  // Screenshot data
  screenshot?: {
    data: string; // base64
    width: number;
    height: number;
    format: 'png';
  };
  // Browser state
  browserState?: {
    url: string | null;
    title: string | null;
    isActive: boolean;
    viewport: {
      width: number;
      height: number;
    };
  };
  timestamp: string;
}

// IPC channel names
export const CUA_IPC_CHANNELS = {
  NAVIGATE: 'cua:navigate',
  CLICK: 'cua:click',
  TYPE: 'cua:type',
  KEY_PRESS: 'cua:keyPress',
  SCROLL: 'cua:scroll',
  SCREENSHOT: 'cua:screenshot',
  GET_STATE: 'cua:getState',
  CLOSE_BROWSER: 'cua:closeBrowser',
} as const;

// Result types for IPC handlers
export interface CUAActionResult {
  success: boolean;
  error?: string;
}

export interface CUAScreenshotResult extends CUAActionResult {
  data?: string;
  width?: number;
  height?: number;
}

export interface CUABrowserState {
  url: string | null;
  title: string | null;
  isActive: boolean;
  viewport: {
    width: number;
    height: number;
  };
}
