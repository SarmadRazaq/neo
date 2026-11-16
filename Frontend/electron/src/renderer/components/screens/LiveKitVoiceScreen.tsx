/**
 * LiveKit Voice Screen
 * Real voice assistant screen that connects to LiveKit
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useConnectionState,
  useDataChannel,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { VideoOrb, OrbState } from '../ui/VideoOrb';
import { NeoLogo } from '../ui/NeoLogo';
import { NeoBackground } from '../ui/NeoBackground';
import './VoiceScreen.css';

// ==================== Strongly Typed Command Models ====================

/** Base command interface with common metadata */
interface BaseCommand {
  timestamp: string;
  requestId?: string;
}

/** Stagehand AI browser automation command */
interface StagehandTaskCommand extends BaseCommand {
  type: 'stagehand_task';
  instruction: string;
  url?: string;
  maxSteps?: number;
}

/** Legacy command to open an application */
interface OpenAppCommand extends BaseCommand {
  type: 'open_app';
  app: string;
}

/** Legacy command to read screen content */
interface ReadScreenCommand extends BaseCommand {
  type: 'read_screen';
  section?: 'all' | 'main' | 'headers' | 'links' | 'emails';
}

/** Command to cancel the current task */
interface CancelTaskCommand extends BaseCommand {
  type: 'cancel_task';
  reason?: string;
}

/** Union type of all possible agent commands */
type AgentCommand = StagehandTaskCommand | OpenAppCommand | ReadScreenCommand | CancelTaskCommand;

// ==================== Strongly Typed Response Models ====================

/** Result from a Stagehand task execution */
interface StagehandTaskResult {
  message?: string;
  data?: string;
  actions?: string[];
}

/** Command types supported by the agent */
type AgentCommandType = 'stagehand_task' | 'open_app' | 'read_screen' | 'cancel_task' | 'unknown';

/** Response sent back to backend via Text Stream */
interface AgentResponse {
  type: 'cua_result';  // Keep for compatibility with existing handling
  success: boolean;
  commandType: AgentCommandType;
  requestId?: string;
  error?: string;
  taskResult?: StagehandTaskResult;
  timestamp: string;
}

/**
 * Execute agent commands via Stagehand or legacy handlers
 * Returns an AgentResponse to send back to the backend
 */
const executeAgentCommand = async (command: AgentCommand): Promise<AgentResponse> => {
  const baseResponse: AgentResponse = {
    type: 'cua_result',  // Keep for compatibility
    success: false,
    commandType: command.type,
    requestId: command.requestId,
    timestamp: new Date().toISOString(),
  };

  try {
    switch (command.type) {
      // ===== Stagehand AI Browser Automation (Primary) =====
      case 'stagehand_task': {
        if (!window.electronAPI?.stagehand) {
          return { ...baseResponse, error: 'Stagehand API not available - running outside Electron?' };
        }
        
        if (!command.instruction) {
          return { ...baseResponse, error: 'Stagehand task requires instruction' };
        }

        console.log(`[Stagehand] Executing task: ${command.instruction}`);
        const result = await window.electronAPI.stagehand.executeTask({
          instruction: command.instruction,
          url: command.url,
          maxSteps: command.maxSteps,
        });

        return {
          ...baseResponse,
          success: result.success,
          error: result.error,
          taskResult: {
            message: result.message,
            data: result.data,
            actions: result.actions,
          },
        };
      }

      // ===== Legacy Commands =====
      case 'open_app': {
        await handleOpenApp(command.app || '');
        return { ...baseResponse, success: true };
      }

      case 'read_screen': {
        // TODO: Implement with accessibility APIs
        console.log(`Reading screen section: ${command.section || 'all'}`);
        return { ...baseResponse, success: true };
      }

      // ===== Task Control Commands =====
      case 'cancel_task': {
        console.log(`[Cancel] Cancelling current task: ${command.reason || 'user_interrupted'}`);
        if (window.electronAPI?.stagehand?.cancel) {
          await window.electronAPI.stagehand.cancel(command.reason);
        }
        return { ...baseResponse, success: true };
      }

      default: {
        // Exhaustive check - this should never happen with properly typed commands
        const _exhaustiveCheck: never = command;
        return { ...baseResponse, commandType: 'unknown', error: `Unknown command type: ${(_exhaustiveCheck as AgentCommand).type}` };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Agent command failed:`, error);
    return { ...baseResponse, error: errorMessage };
  }
};

// Topic for agent responses (using LiveKit Text Streams)
const AGENT_RESPONSE_TOPIC = 'agent-response';

// Topic for progress events
const PROGRESS_TOPIC = 'stagehand-progress';

/**
 * Legacy handler for opening apps (opens in system browser)
 */
const handleOpenApp = async (appName: string) => {
  const appMap: Record<string, string> = {
    'email': 'mailto:',
    'mail': 'mailto:',
    'outlook': 'outlook:',
    'gmail': 'https://mail.google.com',
    'browser': 'https://google.com',
    'chrome': 'https://google.com',
    'google': 'https://google.com',
    'youtube': 'https://youtube.com',
    'calendar': 'https://calendar.google.com',
    'settings': 'ms-settings:',
  };

  const url = appMap[appName.toLowerCase()] || `https://${appName}.com`;
  
  if (window.electronAPI?.open) {
    await window.electronAPI.open(url);
    console.log(`Opened: ${url}`);
  } else {
    window.open(url, '_blank');
  }
};

interface LiveKitVoiceScreenProps {
  token: string;
  serverUrl: string;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Inner component that uses LiveKit hooks
 * Must be rendered inside LiveKitRoom
 */
const VoiceAssistantContent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const room = useRoomContext();
  
  // Log connection state changes
  useEffect(() => {
    console.log(`[VoiceAssistant] Connection state: ${connectionState}, Voice state: ${state}`);
  }, [connectionState, state]);
  
  // Track if we're currently processing a command to avoid duplicates
  const processingRef = useRef<Set<string>>(new Set());
  
  // Push-to-talk state
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const isHoldingRef = useRef(false);

  /**
   * Send response back to backend via LiveKit Text Stream
   * Text Streams automatically handle chunking for large messages (no size limit)
   */
  const sendResponse = useCallback(async (response: AgentResponse) => {
    if (!room || connectionState !== ConnectionState.Connected) {
      console.warn('Cannot send response: room not connected');
      return;
    }

    try {
      const responseJson = JSON.stringify(response);
      console.log(`[Agent] Sending response via Text Stream (${responseJson.length} bytes)...`);
      
      // Use LiveKit Text Streams - automatically handles chunking for any size
      await room.localParticipant.sendText(responseJson, {
        topic: AGENT_RESPONSE_TOPIC,
      });
      
      console.log(`[Agent] Response sent for ${response.commandType}: ${response.success ? 'success' : response.error}`);
    } catch (error) {
      console.error('[Agent] Failed to send response:', error);
    }
  }, [room, connectionState]);

  /**
   * Send structured progress event to AI agent
   * The LLM will decide what to say based on this data
   */
  const sendProgress = useCallback(async (event: { type: string; data: Record<string, unknown>; timestamp: string }) => {
    if (!room || connectionState !== ConnectionState.Connected) {
      console.log('[Progress] Cannot send: room not connected');
      return;
    }

    try {
      const progressJson = JSON.stringify(event);
      
      // Send progress via Text Stream on dedicated topic
      await room.localParticipant.sendText(progressJson, {
        topic: PROGRESS_TOPIC,
      });
      
      console.log(`[Progress] Sent: ${event.type}`, event.data);
    } catch (error) {
      console.error('[Progress] Failed to send:', error);
    }
  }, [room, connectionState]);

  // Subscribe to Stagehand progress events from main process
  useEffect(() => {
    if (!window.electronAPI?.stagehand?.onProgress) {
      console.log('[Progress] Stagehand progress API not available');
      return;
    }

    console.log('[Progress] Subscribing to Stagehand progress events...');
    const cleanup = window.electronAPI.stagehand.onProgress((event) => {
      console.log('[Progress] Received from Stagehand:', event.type, event.data);
      sendProgress(event);
    });

    return () => {
      console.log('[Progress] Unsubscribing from Stagehand progress events');
      cleanup();
    };
  }, [sendProgress]);

  // Handle incoming data messages from the agent
  const onDataReceived = useCallback(async (msg: { payload: Uint8Array }) => {
    try {
      const message = new TextDecoder().decode(msg.payload);
      const command = JSON.parse(message) as AgentCommand;
      
      // Generate a unique key for this command to prevent duplicate processing
      const commandKey = `${command.type}-${command.timestamp}-${command.requestId || ''}`;
      
      // Skip if already processing this command
      if (processingRef.current.has(commandKey)) {
        return;
      }
      processingRef.current.add(commandKey);

      console.log('[Agent] Received command:', command.type, command);

      // Execute the command and get the response
      const response = await executeAgentCommand(command);

      // Send response back to backend
      await sendResponse(response);

      // Clean up processing tracker after a delay
      setTimeout(() => {
        processingRef.current.delete(commandKey);
      }, 5000);

    } catch (error) {
      console.error('[Agent] Failed to process command:', error);
      
      // Send error response
      await sendResponse({
        type: 'cua_result',
        success: false,
        commandType: 'unknown',
        error: error instanceof Error ? error.message : 'Failed to parse command',
        timestamp: new Date().toISOString(),
      });
    }
  }, [sendResponse]);

  // Subscribe to data channel
  useDataChannel(onDataReceived);

  // Enable/disable microphone
  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    if (!room || connectionState !== ConnectionState.Connected) return;
    
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setIsMicEnabled(enabled);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [room, connectionState]);

  // Push-to-talk: Space key handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Space key, ignore if in input fields
      if (e.code !== 'Space') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isHoldingRef.current) return; // Already holding
      
      e.preventDefault();
      isHoldingRef.current = true;
      setMicrophoneEnabled(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!isHoldingRef.current) return;
      
      e.preventDefault();
      isHoldingRef.current = false;
      setMicrophoneEnabled(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setMicrophoneEnabled]);

  // Button click handler - toggle mic
  const handleButtonClick = useCallback(() => {
    setMicrophoneEnabled(!isMicEnabled);
  }, [isMicEnabled, setMicrophoneEnabled]);

  // Map LiveKit voice assistant state to our orb state
  const getOrbState = (): OrbState => {
    if (connectionState === ConnectionState.Connecting) return 'idle';
    if (connectionState === ConnectionState.Disconnected) return 'idle';
    
    switch (state) {
      case 'listening':
        return 'listening';
      case 'thinking':
        return 'processing';
      case 'speaking':
        return 'speaking';
      default:
        return 'idle';
    }
  };

  const orbState = getOrbState();
  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting = connectionState === ConnectionState.Connecting;

  // Effective visual state — the single source of truth for what the UI shows.
  // Combines the mic state (what the USER is doing) with the agent state (what NEO is doing).
  const effectiveOrbState: OrbState = (() => {
    if (connectionState === ConnectionState.Connecting) return 'idle';
    if (connectionState === ConnectionState.Disconnected) return 'idle';

    // Processing and speaking are always driven by the agent, regardless of mic
    if (orbState === 'processing') return 'processing';
    if (orbState === 'speaking') return 'speaking';

    // For idle/listening, mic state is what matters:
    // - Mic ON  -> show "listening" (even if agent hasn't caught up yet)
    // - Mic OFF -> show "idle"     (even if agent still says "listening")
    return isMicEnabled ? 'listening' : 'idle';
  })();

  // Header content
  const getHeaderContent = () => {
    if (isConnecting) return <NeoLogo size="sm" className="voice-logo" />;
    if (!isConnected) return <span className="voice-status-text">Disconnected</span>;

    switch (effectiveOrbState) {
      case 'idle':
        return <NeoLogo size="sm" className="voice-logo" />;
      case 'listening':
        return <span className="voice-status-text voice-status-listening">Listening</span>;
      case 'processing':
        return <span className="voice-status-text">Processing</span>;
      case 'speaking':
        return <span className="voice-status-text">Speaking</span>;
      default:
        return <NeoLogo size="sm" className="voice-logo" />;
    }
  };

  // Message below orb/spinner
  const getMessage = (): React.ReactNode => {
    if (isConnecting) return 'Connecting to NEO...';
    if (!isConnected) return 'Connection lost. Please try again.';

    switch (effectiveOrbState) {
      case 'idle':
        return <>Say a command or{'\n'}press and hold <strong>Space</strong></>;
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Thinking...';
      case 'speaking':
        return null;
      default:
        return null;
    }
  };

  // Hint text at bottom
  const getHintText = (): string => {
    if (isConnecting) return 'Please wait while NEO starts up...';
    if (!isConnected) return 'Check your connection and try again';

    switch (effectiveOrbState) {
      case 'idle':
        return 'Hold Space to speak';
      case 'listening':
        return isHoldingRef.current
          ? 'Release Space to stop'
          : 'Click the button to stop listening';
      case 'processing':
        return 'Please wait';
      case 'speaking':
        return 'Say "Stop" to interrupt';
      default:
        return '';
    }
  };

  // Should show button (not during processing)
  const showButton = effectiveOrbState !== 'processing' && isConnected;

  // Button text based on state
  const getButtonText = (): string => {
    if (effectiveOrbState === 'listening') return 'Stop listening';
    if (effectiveOrbState === 'speaking') return 'Stop speaking';
    return 'Start listening';
  };

  // Button style class based on state
  const getButtonClass = (): string => {
    if (effectiveOrbState === 'listening' || effectiveOrbState === 'speaking') {
      return 'voice-action-btn voice-action-btn--secondary';
    }
    return 'voice-action-btn voice-action-btn--primary';
  };

  return (
    <NeoBackground showEffects={false}>
      <div 
        className={`voice-screen voice-state-${effectiveOrbState}${isMicEnabled ? ' voice-mic-active' : ''}`} 
        role="main" 
        aria-label={`Voice assistant - ${effectiveOrbState}${isMicEnabled ? ', microphone on' : ''}`}
      >
        {/* Header */}
        <header className="voice-header">
          {onClose && (
            <button 
              className="voice-close-btn"
              onClick={onClose}
              aria-label="Close voice assistant"
            >
              <X size={20} />
            </button>
          )}
          {getHeaderContent()}
        </header>

        {/* Main Content */}
        <div className="voice-content">
          {(isConnecting || effectiveOrbState === 'processing') ? (
            /* Connecting or Processing state: show spinner with message */
            <div className="voice-processing">
              <div className="voice-spinner" />
              <p className="voice-message">{getMessage()}</p>
            </div>
          ) : (
            /* Other states: show video orb with mic indicator */
            <>
              <div className={`voice-orb-wrapper${isMicEnabled ? ' voice-orb-mic-on' : ''}`}>
                <VideoOrb state={effectiveOrbState} size={200} />
                {/* Mic indicator ring */}
                {isMicEnabled && (
                  <div className="voice-mic-ring" aria-hidden="true" />
                )}
              </div>
              {/* Mic status badge — only shown when mic is active (not during idle) */}
              {isConnected && isMicEnabled && (
                <div className="voice-mic-badge voice-mic-badge--on">
                  <span className="voice-mic-badge-dot" />
                  Mic on
                </div>
              )}
              {getMessage() && (
                <p className="voice-message" style={{ whiteSpace: 'pre-line' }}>
                  {getMessage()}
                </p>
              )}
            </>
          )}
        </div>

        {/* Action Button - Custom push-to-talk button */}
        {showButton && (
          <div className="voice-action-area">
            <button 
              className={getButtonClass()}
              onClick={handleButtonClick}
              aria-label={getButtonText()}
            >
              {getButtonText()}
            </button>
          </div>
        )}

        {/* Hint */}
        <p className="voice-hint">{getHintText()}</p>
      </div>
    </NeoBackground>
  );
};

/**
 * Main LiveKit Voice Screen
 * Wraps the content in a LiveKitRoom provider
 */
export const LiveKitVoiceScreen: React.FC<LiveKitVoiceScreenProps> = ({
  token,
  serverUrl,
  onClose,
  onError,
}) => {
  console.log('[LiveKitVoiceScreen] Rendering with serverUrl:', serverUrl);
  
  const handleError = (error: Error) => {
    console.error('LiveKit error:', error);
    onError?.(error);
  };

  const handleConnected = () => {
    console.log('[LiveKitVoiceScreen] *** CONNECTED TO LIVEKIT ROOM ***');
  };

  const handleDisconnected = () => {
    console.log('[LiveKitVoiceScreen] Disconnected from room');
  };

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      onError={handleError}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
    >
      <VoiceAssistantContent onClose={onClose} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
};

export default LiveKitVoiceScreen;
