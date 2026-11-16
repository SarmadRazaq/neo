/**
 * Voice Commands Module
 * Handles microphone input and voice command recognition
 */

import {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionConstructor,
  WindowWithSpeechRecognition,
} from './types';

export interface VoiceCommandConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface VoiceCommandResult {
  command: string;
  confidence?: number;
}

export class VoiceCommandListener {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onCommandCallback?: (result: VoiceCommandResult) => void;

  constructor(config: VoiceCommandConfig = {}) {
    this.initializeRecognition(config);
  }

  private initializeRecognition(config: VoiceCommandConfig): void {
    // Check if browser supports Web Speech API
    const windowWithSpeech = window as WindowWithSpeechRecognition;
    const SpeechRecognitionClass: SpeechRecognitionConstructor | undefined =
      windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      console.warn('Speech recognition not supported in this environment');
      return;
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.lang = config.language || 'en-US';
    this.recognition.continuous = config.continuous !== false;
    this.recognition.interimResults = config.interimResults || false;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];
      const firstAlternative = lastResult[0];
      const transcript = firstAlternative.transcript.trim();
      const confidence = firstAlternative.confidence;

      if (lastResult.isFinal && this.onCommandCallback) {
        this.onCommandCallback({
          command: transcript,
          confidence,
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error, event.message);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // Auto-restart if it was manually started
      if (this.onCommandCallback) {
        this.start();
      }
    };
  }

  /**
   * Start listening for voice commands
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not available'));
        return;
      }

      if (this.isListening) {
        resolve();
        return;
      }

      try {
        this.recognition.start();
        this.isListening = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop listening for voice commands
   */
  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      this.onCommandCallback = undefined;
    }
  }

  /**
   * Register callback for when a command is detected
   */
  onCommand(callback: (result: VoiceCommandResult) => void): void {
    this.onCommandCallback = callback;
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

