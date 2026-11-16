/**
 * LiveKit Room Component
 * Wrapper for LiveKit voice agent functionality
 */

import React from 'react';
import {
  LiveKitRoom as LKRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  VoiceAssistantControlBar,
  useConnectionState,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import '@livekit/components-styles';
import './LiveKitRoom.css';

interface LiveKitRoomProps {
  token: string;
  serverUrl: string;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Voice Assistant UI Component
 * Displays the voice assistant state and controls
 */
const VoiceAssistantUI: React.FC = () => {
  const { state, audioTrack } = useVoiceAssistant();
  const connectionState = useConnectionState();

  const getStatusMessage = (): string => {
    if (connectionState === ConnectionState.Connecting) {
      return 'Connecting to voice assistant...';
    }
    if (connectionState === ConnectionState.Disconnected) {
      return 'Disconnected from voice assistant';
    }
    
    switch (state) {
      case 'disconnected':
        return 'Voice assistant disconnected';
      case 'connecting':
        return 'Connecting...';
      case 'initializing':
        return 'Initializing voice assistant...';
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Processing...';
      case 'speaking':
        return 'Speaking...';
      default:
        return 'Ready';
    }
  };

  return (
    <div className="voice-assistant-container" role="region" aria-label="Voice Assistant">
      <div className="voice-assistant-status">
        <h2>Voice Assistant</h2>
        <p 
          role="status" 
          aria-live="polite"
          className={`status-indicator status-${state}`}
        >
          {getStatusMessage()}
        </p>
      </div>

      <div className="voice-visualizer" aria-hidden="true">
        {audioTrack && (
          <BarVisualizer
            state={state}
            trackRef={audioTrack}
            barCount={5}
            options={{ minHeight: 20 }}
          />
        )}
      </div>

      <div className="voice-controls">
        <VoiceAssistantControlBar />
      </div>
    </div>
  );
};

/**
 * Main LiveKit Room Component
 */
export const LiveKitRoom: React.FC<LiveKitRoomProps> = ({
  token,
  serverUrl,
  onDisconnect,
  onError,
}) => {
  const handleError = (error: Error) => {
    console.error('LiveKit error:', error);
    if (onError) {
      onError(error);
    }
  };

  const handleDisconnected = () => {
    console.log('Disconnected from LiveKit room');
    if (onDisconnect) {
      onDisconnect();
    }
  };

  return (
    <LKRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      onError={handleError}
      onDisconnected={handleDisconnected}
    >
      <VoiceAssistantUI />
      <RoomAudioRenderer />
    </LKRoom>
  );
};

export default LiveKitRoom;

