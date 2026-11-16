/**
 * Accessibility Utilities
 * Provides utilities for screen reader and accessibility features
 */

export class Accessibility {
  /**
   * Announce text to screen reader
   */
  static announce(text: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = text;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  /**
   * Focus an element and announce it
   */
  static focusAndAnnounce(element: HTMLElement, announcement?: string): void {
    element.focus();
    if (announcement) {
      this.announce(announcement);
    }
  }

  /**
   * Check if screen reader is likely active
   */
  static isScreenReaderActive(): boolean {
    // This is a heuristic check
    return window.navigator.userAgent.includes('NVDA') || 
           window.navigator.userAgent.includes('JAWS') ||
           window.navigator.userAgent.includes('VoiceOver');
  }
}

