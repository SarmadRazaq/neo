/**
 * Type definitions for Electron API exposed via preload script
 */

// CUA (Computer Use Agent) Types - Legacy Puppeteer-based
export interface CUAActionResult {
  success: boolean;
  error?: string;
}

export interface CUAScreenshotResult extends CUAActionResult {
  data?: string; // base64 encoded PNG
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

export interface CUAAPI {
  navigate: (url: string) => Promise<CUAActionResult>;
  click: (x: number, y: number) => Promise<CUAActionResult>;
  type: (text: string) => Promise<CUAActionResult>;
  keyPress: (key: string) => Promise<CUAActionResult>;
  scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) => Promise<CUAActionResult>;
  screenshot: () => Promise<CUAScreenshotResult>;
  getState: () => Promise<CUABrowserState>;
  closeBrowser: () => Promise<void>;
}

// Stagehand Types - AI-powered browser automation
export interface StagehandTaskRequest {
  instruction: string;
  url?: string;
  maxSteps?: number;
}

export interface StagehandTaskResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
  actions?: any[];
}

export interface StagehandScreenshotResult {
  success: boolean;
  data?: string; // base64 encoded PNG
  error?: string;
}

// Structured progress event from Stagehand - LLM decides what to say
export interface StagehandProgressEvent {
  type: 'browser_init' | 'navigating' | 'page_loaded' | 'captcha_detected' | 'captcha_solving' | 'captcha_solved' | 'task_executing' | 'content_extracting' | 'task_complete' | 'error';
  data: {
    url?: string;
    domain?: string;
    captchaType?: string;
    error?: string;
    step?: number;
    totalSteps?: number;
  };
  timestamp: string;
}

export interface StagehandAPI {
  executeTask: (request: StagehandTaskRequest) => Promise<StagehandTaskResult>;
  act: (action: string) => Promise<StagehandTaskResult>;
  extract: (instruction: string) => Promise<StagehandTaskResult>;
  navigate: (url: string) => Promise<StagehandTaskResult>;
  screenshot: () => Promise<StagehandScreenshotResult>;
  getUrl: () => Promise<string | null>;
  close: () => Promise<{ success: boolean }>;
  cancel: (reason?: string) => Promise<{ success: boolean }>;
  // Subscribe to real-time progress events
  onProgress: (callback: (event: StagehandProgressEvent) => void) => () => void;
}

// LiveKit session response from backend
export interface LiveKitSession {
  roomName: string;
  token: string;
  url: string;
}

export interface ElectronAPI {
  open: (path: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  startVoiceListening: () => Promise<void>;
  stopVoiceListening: () => Promise<void>;
  onVoiceCommand: (callback: (command: string) => void) => void;
  getAuthToken: () => Promise<string | null>;
  setAuthToken: (token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  getLiveKitSession: (userId?: string) => Promise<LiveKitSession | null>;
  getBackendUrl: () => Promise<string>;
  isTestingMode: () => Promise<boolean>;
  showWindow: () => Promise<void>;
  cua: CUAAPI;
  stagehand: StagehandAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

