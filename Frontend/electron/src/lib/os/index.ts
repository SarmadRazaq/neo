/**
 * OS Abstraction Layer
 * Provides cross-platform APIs for OS-specific operations
 */

import { platform } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OSPlatform {
  open(path: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  getPlatform(): string;
}

class WindowsOS implements OSPlatform {
  async open(path: string): Promise<void> {
    await execAsync(`start "" "${path}"`);
  }

  async showItemInFolder(path: string): Promise<void> {
    await execAsync(`explorer /select,"${path}"`);
  }

  getPlatform(): string {
    return 'win32';
  }
}

class MacOS implements OSPlatform {
  async open(path: string): Promise<void> {
    await execAsync(`open "${path}"`);
  }

  async showItemInFolder(path: string): Promise<void> {
    await execAsync(`open -R "${path}"`);
  }

  getPlatform(): string {
    return 'darwin';
  }
}

class LinuxOS implements OSPlatform {
  async open(path: string): Promise<void> {
    // Try common Linux file managers
    const commands = [
      `xdg-open "${path}"`,
      `nautilus "${path}"`,
      `dolphin "${path}"`,
    ];

    for (const cmd of commands) {
      try {
        await execAsync(cmd);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('No suitable file manager found');
  }

  async showItemInFolder(path: string): Promise<void> {
    await this.open(path);
  }

  getPlatform(): string {
    return 'linux';
  }
}

/**
 * Factory function to get the appropriate OS implementation
 */
export function getOS(): OSPlatform {
  const currentPlatform = platform();
  
  switch (currentPlatform) {
    case 'win32':
      return new WindowsOS();
    case 'darwin':
      return new MacOS();
    case 'linux':
      return new LinuxOS();
    default:
      throw new Error(`Unsupported platform: ${currentPlatform}`);
  }
}

