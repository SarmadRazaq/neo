import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { bootstrapSecrets } from './secrets';
import { setupIpcHandlers } from './ipcHandlers';
import { setupCUAHandlers, browserManager } from './cua';
import { setupStagehandHandlers, stagehandManager } from './stagehand';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

/**
 * Create a tray icon. Tries to load icon.png from assets,
 * falls back to a small generated icon.
 */
function createTrayIcon(): Electron.NativeImage {
  // Try loading a PNG icon from assets
  const iconPaths = [
    path.join(__dirname, '../../assets/icon.png'),      // dev: relative to dist/main
    path.join(process.resourcesPath || '', 'assets/icon.png'), // packaged
  ];

  for (const iconPath of iconPaths) {
    try {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          return icon.resize({ width: 16, height: 16 });
        }
      }
    } catch {
      // Try next path
    }
  }

  // Fallback: create a simple 16x16 icon programmatically
  // A small teal circle on transparent background
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4); // RGBA
  const cx = size / 2, cy = size / 2, r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const idx = (y * size + x) * 4;
      if (dist <= r) {
        canvas[idx] = 0;       // R
        canvas[idx + 1] = 200; // G
        canvas[idx + 2] = 200; // B
        canvas[idx + 3] = 255; // A
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function setupTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('NEO - Voice-First AI Agent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show NEO',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon restores the window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 560,
    minWidth: 360,
    useContentSize: true, // width/height refers to content area, not window frame
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Accessibility features
    titleBarStyle: 'default',
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      console.log('[Tray] Window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  // In dev mode: connect to webpack dev server. In testing/production or packaged: load bundled HTML.
  const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'testing');
  if (isDev) {
    // Wait for dev server to be ready, then load
    const loadDevServer = () => {
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:3001').catch((error) => {
          console.log('Dev server not ready, retrying in 1 second...', error);
          setTimeout(loadDevServer, 1000);
        });
      }
    };
    loadDevServer();
    if (mainWindow) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    if (mainWindow) {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  }
}

app.whenReady().then(async () => {
  // Fetch secrets from Doppler API (no-op in dev when using `doppler run`)
  await bootstrapSecrets();

  // Setup IPC handlers
  setupIpcHandlers();
  setupCUAHandlers();
  setupStagehandHandlers();

  // Setup system tray
  setupTray();

  createWindow();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to start app:', error);
});

// On macOS, don't quit when all windows are closed (tray keeps running)
// On Windows/Linux, the tray keeps the app alive anyway
app.on('window-all-closed', () => {
  // Don't quit - tray keeps the app running
});

// Allow actual quit from tray menu or system
app.on('before-quit', () => {
  isQuitting = true;
});

// Clean up browser on quit
app.on('will-quit', async () => {
  await browserManager.close();
  await stagehandManager.close();
});
