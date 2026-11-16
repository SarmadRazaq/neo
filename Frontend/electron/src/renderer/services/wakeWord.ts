/**
 * Wake Word Detection Service
 * 
 * Uses the Web Speech API (built into Chromium) to listen for "Hey Neo".
 * This runs entirely in the browser engine -- no AI tokens are consumed.
 * 
 * When the wake word is detected, it signals the main process to
 * restore/focus the window and activate the voice session.
 */

import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  WindowWithSpeechRecognition,
} from '../../lib/voice/types';

// Wake word patterns to match against (case-insensitive)
// Includes common misrecognitions from Web Speech API
const WAKE_PATTERNS = [
  'hey neo',
  'hey, neo',
  'hey neo.',
  'a neo',        // common misrecognition
  'hey neil',     // common misrecognition
  'hey neel',
  'hey neol',
  'hey nio',
  'hey nemo',     // close enough
  'heyneo',
  'hey kneo',
  'they neo',     // "they" misheard as "hey"
  'hey new',      // common misrecognition
  'hay neo',
  'hey neo!',
  'hey nyo',
  'hey ne o',
  'he neo',
  'henio',
  'haineo',
];

export type WakeWordCallback = () => void;

export class WakeWordService {
  private recognition: SpeechRecognition | null = null;
  private isListening = false;
  private onWake: WakeWordCallback | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Check if the Web Speech API is available
   */
  isAvailable(): boolean {
    const w = window as unknown as WindowWithSpeechRecognition;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  /**
   * Start listening for the wake word.
   * Calls the callback when "Hey Neo" is detected.
   */
  start(onWake: WakeWordCallback): boolean {
    if (!this.isAvailable()) {
      console.warn('[WakeWord] Web Speech API not available');
      return false;
    }

    if (this.isListening) {
      console.log('[WakeWord] Already listening');
      return true;
    }

    this.onWake = onWake;

    const w = window as unknown as WindowWithSpeechRecognition;
    const SpeechRecognitionClass = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return false;

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    // Request multiple alternatives for better matching
    this.recognition.maxAlternatives = 5;

    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('[WakeWord] Listening for "Hey Neo"...');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Check all results from the current index
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Check all alternatives for wake word matches
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript.toLowerCase().trim();
          
          // Log what the Speech API is hearing (interim and final)
          if (transcript.length > 0) {
            const isFinal = result.isFinal;
            console.log(`[WakeWord] Heard${isFinal ? ' (final)' : ''} [alt ${j}]: "${transcript}"`);
          }
          
          if (this.matchesWakeWord(transcript)) {
            console.log(`[WakeWord] ✓ MATCH! Transcript: "${transcript}"`);
            this.onWake?.();
            
            // Briefly stop and restart to avoid re-triggering
            this.restartAfterDetection();
            return;
          }
        }
      }
    };

    this.recognition.onerror = (event) => {
      const error = event.error;
      // 'no-speech' and 'aborted' are expected during normal operation
      if (error === 'no-speech') {
        // This is normal - just means silence was detected, restart
        this.scheduleRestart();
      } else if (error === 'aborted') {
        // Expected when we intentionally stop
      } else if (error === 'not-allowed') {
        console.error('[WakeWord] Microphone permission denied. Wake word will not work.');
      } else {
        console.warn(`[WakeWord] Error: ${error}`);
        // Auto-restart on recoverable errors
        if (error === 'audio-capture' || error === 'network') {
          this.scheduleRestart();
        }
      }
    };

    this.recognition.onend = () => {
      const wasListening = this.isListening;
      this.isListening = false;
      // Auto-restart if we haven't explicitly stopped
      if (this.onWake) {
        if (wasListening) {
          console.log('[WakeWord] Recognition ended, restarting...');
        }
        this.scheduleRestart();
      }
    };

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('[WakeWord] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop listening for the wake word.
   */
  stop(): void {
    this.onWake = null;
    this.isListening = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore errors on stop
      }
      this.recognition = null;
    }

    console.log('[WakeWord] Stopped listening');
  }

  /**
   * Check if a transcript matches any wake word pattern.
   * Uses both exact substring matching and a normalized fuzzy check.
   */
  private matchesWakeWord(transcript: string): boolean {
    // Direct pattern matching
    if (WAKE_PATTERNS.some(pattern => transcript.includes(pattern))) {
      return true;
    }

    // Normalized matching: strip punctuation/spaces and check
    const normalized = transcript.replace(/[^a-z]/g, '');
    if (normalized.includes('heyneo') || normalized.includes('haineo') || normalized.includes('heneo')) {
      return true;
    }

    // Check for "neo" preceded by any short greeting-like word
    // This catches "hey neo", "a neo", "hi neo", "he neo" etc.
    const neoMatch = transcript.match(/\b(hey|hi|he|a|hay|hai|they)\s*,?\s*n[eiy]+[oa]?\b/);
    if (neoMatch) {
      return true;
    }

    return false;
  }

  /**
   * Restart recognition after a brief delay (avoids rapid re-triggering)
   */
  private restartAfterDetection(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
    }

    // Wait 2 seconds before listening again (avoids echo from NEO's response)
    this.restartTimeout = setTimeout(() => {
      if (this.onWake && !this.isListening) {
        this.startRecognition();
      }
    }, 2000);
  }

  /**
   * Schedule a restart after an error or recognition end
   */
  private scheduleRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    this.restartTimeout = setTimeout(() => {
      if (this.onWake && !this.isListening) {
        this.startRecognition();
      }
    }, 1000);
  }

  /**
   * Internal: start the recognition instance
   */
  private startRecognition(): void {
    if (!this.recognition || !this.onWake) return;

    try {
      this.recognition.start();
    } catch {
      // If the old instance is dead, create a new one
      console.log('[WakeWord] Recreating recognition instance...');
      if (this.onWake) {
        const callback = this.onWake;
        this.stop();
        this.start(callback);
      }
    }
  }
}

// Singleton
let wakeWordInstance: WakeWordService | null = null;

export function getWakeWordService(): WakeWordService {
  if (!wakeWordInstance) {
    wakeWordInstance = new WakeWordService();
  }
  return wakeWordInstance;
}
