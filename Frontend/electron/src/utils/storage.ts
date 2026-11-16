/**
 * Storage Utilities
 * Provides a simple storage interface for the app
 */

export class Storage {
  /**
   * Get item from storage
   */
  static getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Storage getItem error:', error);
      return null;
    }
  }

  /**
   * Set item in storage
   */
  static setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Storage setItem error:', error);
    }
  }

  /**
   * Remove item from storage
   */
  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Storage removeItem error:', error);
    }
  }

  /**
   * Clear all storage
   */
  static clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
    }
  }
}

