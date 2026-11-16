import React from 'react';
import { Mic } from 'lucide-react';
import { NeoBackground } from '../ui/NeoBackground';
import './MicPermissionScreen.css';

interface MicPermissionScreenProps {
  onAllowMicrophone: () => void;
  onContinueWithoutVoice: () => void;
}

export const MicPermissionScreen: React.FC<MicPermissionScreenProps> = ({ 
  onAllowMicrophone,
  onContinueWithoutVoice 
}) => {
  return (
    <NeoBackground glowIntensity="medium" showRings={true}>
      <div className="mic-permission-screen" role="main" aria-label="Microphone permission request">
        {/* Content */}
        <div className="mic-permission-content">
          {/* Icon */}
          <div className="mic-permission-icon-container">
            <Mic size={32} strokeWidth={1.5} />
          </div>

          {/* Text */}
          <h1 className="mic-permission-title">Microphone access</h1>
          <p className="mic-permission-subtitle">
            NEO needs microphone access to hear you.
          </p>

          {/* Buttons */}
          <button 
            className="neo-btn-primary mic-permission-allow-btn"
            onClick={onAllowMicrophone}
            aria-label="Allow microphone access"
          >
            Allow microphone
          </button>

          <button 
            className="neo-btn-ghost mic-permission-skip-btn"
            onClick={onContinueWithoutVoice}
          >
            Continue without voice
          </button>
        </div>
      </div>
    </NeoBackground>
  );
};

export default MicPermissionScreen;
