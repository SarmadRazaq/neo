/**
 * Voice Commands Module
 * Orchestrates voice command listening using the voice library
 */

import { VoiceCommandListener, VoiceCommandConfig, VoiceCommandResult } from '../../lib/voice/voiceCommands';

export class VoiceModule {
  private listener: VoiceCommandListener;
  private commandHandlers: Map<string, (args?: string) => void> = new Map();

  constructor(config: VoiceCommandConfig = {}) {
    this.listener = new VoiceCommandListener(config);
    this.setupCommandListener();
  }

  private setupCommandListener(): void {
    this.listener.onCommand((result: VoiceCommandResult) => {
      this.processCommand(result.command);
    });
  }

  /**
   * Register a command handler
   */
  registerCommand(command: string, handler: (args?: string) => void): void {
    this.commandHandlers.set(command.toLowerCase(), handler);
  }

  /**
   * Process a voice command
   */
  private processCommand(text: string): void {
    const lowerText = text.toLowerCase().trim();
    
    // Try exact match first
    if (this.commandHandlers.has(lowerText)) {
      const handler = this.commandHandlers.get(lowerText);
      if (handler) {
        handler();
        return;
      }
    }

    // Try prefix matching (e.g., "open file" -> "open")
    for (const [command, handler] of this.commandHandlers.entries()) {
      if (lowerText.startsWith(command)) {
        const args = text.substring(command.length).trim();
        handler(args || undefined);
        return;
      }
    }

    // Default handler for unrecognized commands
    console.log('Unrecognized command:', text);
  }

  /**
   * Start listening for voice commands
   */
  async start(): Promise<void> {
    await this.listener.start();
  }

  /**
   * Stop listening for voice commands
   */
  stop(): void {
    this.listener.stop();
  }

  /**
   * Check if currently listening
   */
  isListening(): boolean {
    return this.listener.getIsListening();
  }
}

