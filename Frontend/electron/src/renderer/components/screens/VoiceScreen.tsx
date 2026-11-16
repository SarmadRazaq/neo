import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { AnimatedOrb, OrbState } from '../ui/AnimatedOrb';
import { NeoLogo } from '../ui/NeoLogo';
import { NeoBackground } from '../ui/NeoBackground';
import './VoiceScreen.css';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceScreenProps {
  state?: VoiceState;
  onClose?: () => void;
  onStartListening?: () => void;
  onStopListening?: () => void;
  onStopSpeaking?: () => void;
}

const stateConfig: Record<VoiceState, {
  statusText: string;
  buttonText: string;
  hint: string;
  showButton: boolean;
  glowIntensity: 'low' | 'medium' | 'high';
}> = {
  idle: {
    statusText: '',
    buttonText: 'Start listening',
    hint: 'Space - Speak',
    showButton: true,
    glowIntensity: 'medium',
  },
  listening: {
    statusText: 'Listening',
    buttonText: 'Stop listening',
    hint: 'Release Space to stop',
    showButton: true,
    glowIntensity: 'medium',
  },
  processing: {
    statusText: 'Processing',
    buttonText: '',
    hint: 'Please wait',
    showButton: false,
    glowIntensity: 'low',
  },
  speaking: {
    statusText: 'Speaking',
    buttonText: 'Stop speaking',
    hint: 'Say "Stop" to interrupt',
    showButton: true,
    glowIntensity: 'high',
  },
};

export const VoiceScreen: React.FC<VoiceScreenProps> = ({ 
  state = 'idle',
  onClose,
  onStartListening,
  onStopListening,
  onStopSpeaking,
}) => {
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const config = stateConfig[state];
  
  // Map voice state to orb state
  const orbState: OrbState = state;

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat && state === 'idle') {
      e.preventDefault();
      setIsSpaceHeld(true);
      onStartListening?.();
    }
  }, [state, onStartListening]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && state === 'listening') {
      e.preventDefault();
      setIsSpaceHeld(false);
      onStopListening?.();
    }
  }, [state, onStopListening]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const handleButtonClick = () => {
    switch (state) {
      case 'idle':
        onStartListening?.();
        break;
      case 'listening':
        onStopListening?.();
        break;
      case 'speaking':
        onStopSpeaking?.();
        break;
    }
  };

  const getStatusMessage = () => {
    switch (state) {
      case 'idle':
        return (
          <>
            Say a command or<br />press <strong>Space</strong>
          </>
        );
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Thinking...';
      case 'speaking':
        return null; // No message when speaking, just the orb
    }
  };

  return (
    <NeoBackground glowIntensity={config.glowIntensity} showRings={false}>
      <div 
        className={`voice-screen voice-state-${state}`} 
        role="main" 
        aria-label={`Voice assistant - ${state}`}
      >
        {/* Header */}
        <header className="voice-header">
          {onClose && (
            <button 
              className="voice-close-btn"
              onClick={onClose}
              aria-label="Close voice assistant"
            >
              <X size={24} />
            </button>
          )}
          
          {state === 'idle' ? (
            <NeoLogo size="sm" className="voice-logo" />
          ) : (
            <span className="voice-status-text">{config.statusText}</span>
          )}
        </header>

        {/* Main Content */}
        <div className="voice-content">
          {state === 'processing' ? (
            <div className="voice-processing">
              <div className="voice-spinner" />
              <p className="voice-message">{getStatusMessage()}</p>
            </div>
          ) : (
            <>
              <AnimatedOrb state={orbState} size={180} />
              {getStatusMessage() && (
                <p className="voice-message">{getStatusMessage()}</p>
              )}
            </>
          )}
        </div>

        {/* Button */}
        {config.showButton && (
          <button 
            className={`voice-action-btn ${state === 'idle' ? 'neo-btn-primary' : 'neo-btn-secondary'}`}
            onClick={handleButtonClick}
            aria-pressed={state === 'listening'}
          >
            {config.buttonText}
          </button>
        )}

        {/* Hint */}
        <p className="voice-hint">{config.hint}</p>
      </div>
    </NeoBackground>
  );
};

export default VoiceScreen;
