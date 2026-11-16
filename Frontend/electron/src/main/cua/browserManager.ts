/**
 * Browser Manager
 * Manages Puppeteer browser lifecycle for CUA (Computer Use Agent) operations
 * 
 * Uses the user's installed browser (Opera, Chrome, Edge, etc.) instead of
 * Puppeteer's bundled Chromium for a more native experience.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';

// Default viewport size - consistent for AI model coordinate mapping
const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 800,
};

// Browser paths on Windows (in priority order)
const WINDOWS_BROWSER_PATHS: { name: string; paths: string[] }[] = [
  {
    name: 'Opera GX',
    paths: [
      `${process.env.LOCALAPPDATA}\\Programs\\Opera GX\\opera.exe`,
      'C:\\Program Files\\Opera GX\\opera.exe',
      'C:\\Program Files (x86)\\Opera GX\\opera.exe',
    ],
  },
  {
    name: 'Opera',
    paths: [
      `${process.env.LOCALAPPDATA}\\Programs\\Opera\\opera.exe`,
      'C:\\Program Files\\Opera\\opera.exe',
      'C:\\Program Files (x86)\\Opera\\opera.exe',
    ],
  },
  {
    name: 'Chrome',
    paths: [
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
  },
  {
    name: 'Edge',
    paths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  },
  {
    name: 'Brave',
    paths: [
      `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
  },
];

// Browser paths on macOS
const MACOS_BROWSER_PATHS: { name: string; paths: string[] }[] = [
  { name: 'Opera GX', paths: ['/Applications/Opera GX.app/Contents/MacOS/Opera'] },
  { name: 'Opera', paths: ['/Applications/Opera.app/Contents/MacOS/Opera'] },
  { name: 'Chrome', paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
  { name: 'Edge', paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
  { name: 'Brave', paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
];

// Browser paths on Linux
const LINUX_BROWSER_PATHS: { name: string; paths: string[] }[] = [
  { name: 'Opera', paths: ['/usr/bin/opera'] },
  { name: 'Chrome', paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'] },
  { name: 'Chromium', paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser'] },
  { name: 'Edge', paths: ['/usr/bin/microsoft-edge'] },
  { name: 'Brave', paths: ['/usr/bin/brave-browser'] },
];

/**
 * Detect the user's installed browser
 */
function detectBrowser(): { name: string; path: string } | null {
  const platform = process.platform;
  let browserList: { name: string; paths: string[] }[];

  if (platform === 'win32') {
    browserList = WINDOWS_BROWSER_PATHS;
  } else if (platform === 'darwin') {
    browserList = MACOS_BROWSER_PATHS;
  } else {
    browserList = LINUX_BROWSER_PATHS;
  }

  for (const browser of browserList) {
    for (const browserPath of browser.paths) {
      try {
        if (fs.existsSync(browserPath)) {
          console.log(`[BrowserManager] Found ${browser.name} at: ${browserPath}`);
          return { name: browser.name, path: browserPath };
        }
      } catch {
        // Path doesn't exist, try next
      }
    }
  }

  console.log('[BrowserManager] No user browser found, will use Puppeteer default');
  return null;
}

class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitializing: boolean = false;
  private detectedBrowser: { name: string; path: string } | null = null;

  constructor() {
    // Detect browser on startup
    this.detectedBrowser = detectBrowser();
  }

  /**
   * Get or create the browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.browser) {
        return this.browser;
      }
    }

    this.isInitializing = true;

    try {
      const launchOptions: any = {
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
          '--disable-infobars',
          '--disable-extensions',
        ],
        defaultViewport: DEFAULT_VIEWPORT,
        ignoreDefaultArgs: ['--enable-automation'],
      };

      // Use user's browser if detected
      if (this.detectedBrowser) {
        launchOptions.executablePath = this.detectedBrowser.path;
        console.log(`[BrowserManager] Launching ${this.detectedBrowser.name}...`);
      } else {
        console.log('[BrowserManager] Launching Puppeteer default browser...');
      }

      this.browser = await puppeteer.launch(launchOptions);

      // Handle browser disconnect
      this.browser.on('disconnected', () => {
        console.log('[BrowserManager] Browser disconnected');
        this.browser = null;
        this.page = null;
      });

      const browserName = this.detectedBrowser?.name || 'Chromium';
      console.log(`[BrowserManager] ${browserName} launched successfully`);
      return this.browser;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Get or create the main page
   */
  async getPage(): Promise<Page> {
    const browser = await this.getBrowser();

    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const pages = await browser.pages();
    this.page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Ensure consistent viewport
    await this.page.setViewport(DEFAULT_VIEWPORT);

    return this.page;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();
      
      // Ensure URL has protocol
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      
      await page.goto(normalizedUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      console.log(`[BrowserManager] Navigated to: ${normalizedUrl}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Navigation failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async screenshot(): Promise<{ success: boolean; data?: string; width?: number; height?: number; error?: string }> {
    try {
      const page = await this.getPage();
      
      // Use encoding: 'base64' to get base64 string directly
      const base64 = await page.screenshot({
        type: 'png',
        fullPage: false, // Only visible viewport for consistent coordinates
        encoding: 'base64',
      });

      return {
        success: true,
        data: base64,
        width: DEFAULT_VIEWPORT.width,
        height: DEFAULT_VIEWPORT.height,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Screenshot failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Click at coordinates (x, y)
   */
  async click(x: number, y: number): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();

      // Validate coordinates are within viewport
      if (x < 0 || x > DEFAULT_VIEWPORT.width || y < 0 || y > DEFAULT_VIEWPORT.height) {
        return {
          success: false,
          error: `Coordinates (${x}, ${y}) out of viewport bounds (${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height})`,
        };
      }

      await page.mouse.click(x, y);
      
      // Small delay to allow page to react
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log(`[BrowserManager] Clicked at: (${x}, ${y})`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Click failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Type text using keyboard
   */
  async type(text: string): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();

      await page.keyboard.type(text, { delay: 50 });

      console.log(`[BrowserManager] Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Type failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Press a specific key (Enter, Tab, Escape, etc.)
   */
  async keyPress(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();

      await page.keyboard.press(key as any);

      console.log(`[BrowserManager] Pressed key: ${key}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Key press failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Scroll the page
   */
  async scroll(
    direction: 'up' | 'down' | 'left' | 'right',
    amount: number = 300
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await this.getPage();

      let deltaX = 0;
      let deltaY = 0;

      switch (direction) {
        case 'up':
          deltaY = -amount;
          break;
        case 'down':
          deltaY = amount;
          break;
        case 'left':
          deltaX = -amount;
          break;
        case 'right':
          deltaX = amount;
          break;
      }

      await page.mouse.wheel({ deltaX, deltaY });
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log(`[BrowserManager] Scrolled ${direction} by ${amount}px`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BrowserManager] Scroll failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<string | null> {
    try {
      const page = await this.getPage();
      return page.url();
    } catch {
      return null;
    }
  }

  /**
   * Get page title
   */
  async getPageTitle(): Promise<string | null> {
    try {
      const page = await this.getPage();
      return await page.title();
    } catch {
      return null;
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('[BrowserManager] Browser closed');
    }
  }

  /**
   * Check if browser is active
   */
  isActive(): boolean {
    return this.browser !== null && this.browser.connected;
  }

  /**
   * Get viewport dimensions
   */
  getViewport(): { width: number; height: number } {
    return { ...DEFAULT_VIEWPORT };
  }

  /**
   * Get detected browser info
   */
  getBrowserInfo(): { name: string; path: string } | null {
    return this.detectedBrowser;
  }
}

// Singleton instance
export const browserManager = new BrowserManager();
