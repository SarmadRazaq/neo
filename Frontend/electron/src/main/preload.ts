import { contextBridge, ipcRenderer } from 'electron';

// CUA IPC channel names (must match main process)
const CUA_IPC_CHANNELS = {
  NAVIGATE: 'cua:navigate',
  CLICK: 'cua:click',
  TYPE: 'cua:type',
  KEY_PRESS: 'cua:keyPress',
  SCROLL: 'cua:scroll',
  SCREENSHOT: 'cua:screenshot',
  GET_STATE: 'cua:getState',
  CLOSE_BROWSER: 'cua:closeBrowser',
} as const;

// Stagehand IPC channel names
const STAGEHAND_IPC_CHANNELS = {
  EXECUTE_TASK: 'stagehand:execute-task',
  ACT: 'stagehand:act',
  EXTRACT: 'stagehand:extract',
  NAVIGATE: 'stagehand:navigate',
  SCREENSHOT: 'stagehand:screenshot',
  GET_URL: 'stagehand:get-url',
  CLOSE: 'stagehand:close',
  CANCEL: 'stagehand:cancel',
  PROGRESS: 'stagehand:progress',
} as const;

// Structured progress event - LLM uses this data to generate speech
interface ProgressEvent {
  type: string;
  data: {
    url?: string;
    domain?: string;
    captchaType?: string;
    error?: string;
  };
  timestamp: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // OS operations
  open: (path: string) => ipcRenderer.invoke('os:open', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('os:showItemInFolder', path),

  // Voice commands
  startVoiceListening: () => ipcRenderer.invoke('voice:start'),
  stopVoiceListening: () => ipcRenderer.invoke('voice:stop'),
  onVoiceCommand: (callback: (command: string) => void) => {
    ipcRenderer.on('voice:command', (_event, command) => callback(command));
  },

  // Auth
  getAuthToken: () => ipcRenderer.invoke('auth:getToken'),
  setAuthToken: (token: string) => ipcRenderer.invoke('auth:setToken', token),
  clearAuth: () => ipcRenderer.invoke('auth:clear'),

  // LiveKit - get session from backend (returns roomName, token, url)
  getLiveKitSession: (userId?: string) => ipcRenderer.invoke('livekit:getSession', userId),

  // Backend
  getBackendUrl: () => ipcRenderer.invoke('config:getBackendUrl'),

  // Config
  isTestingMode: () => ipcRenderer.invoke('config:isTestingMode'),

  // Window control
  showWindow: () => ipcRenderer.invoke('window:show'),

  // CUA (Computer Use Agent) operations - legacy Puppeteer-based
  cua: {
    navigate: (url: string) => ipcRenderer.invoke(CUA_IPC_CHANNELS.NAVIGATE, url),
    click: (x: number, y: number) => ipcRenderer.invoke(CUA_IPC_CHANNELS.CLICK, x, y),
    type: (text: string) => ipcRenderer.invoke(CUA_IPC_CHANNELS.TYPE, text),
    keyPress: (key: string) => ipcRenderer.invoke(CUA_IPC_CHANNELS.KEY_PRESS, key),
    scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) =>
      ipcRenderer.invoke(CUA_IPC_CHANNELS.SCROLL, direction, amount),
    screenshot: () => ipcRenderer.invoke(CUA_IPC_CHANNELS.SCREENSHOT),
    getState: () => ipcRenderer.invoke(CUA_IPC_CHANNELS.GET_STATE),
    closeBrowser: () => ipcRenderer.invoke(CUA_IPC_CHANNELS.CLOSE_BROWSER),
  },

  // Stagehand - AI-powered browser automation
  stagehand: {
    executeTask: (request: { instruction: string; url?: string; maxSteps?: number }) =>
      ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.EXECUTE_TASK, request),
    act: (action: string) => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.ACT, action),
    extract: (instruction: string) => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.EXTRACT, instruction),
    navigate: (url: string) => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.NAVIGATE, url),
    screenshot: () => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.SCREENSHOT),
    getUrl: () => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.GET_URL),
    close: () => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.CLOSE),
    cancel: (reason?: string) => ipcRenderer.invoke(STAGEHAND_IPC_CHANNELS.CANCEL, reason),
    // Subscribe to progress events from Stagehand
    onProgress: (callback: (event: ProgressEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progressEvent: ProgressEvent) => {
        callback(progressEvent);
      };
      ipcRenderer.on(STAGEHAND_IPC_CHANNELS.PROGRESS, handler);
      // Return cleanup function
      return () => {
        ipcRenderer.removeListener(STAGEHAND_IPC_CHANNELS.PROGRESS, handler);
      };
    },
  },
});

