import React, { useState } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import { NeoBackground } from '../ui/NeoBackground';
import './AudioTestScreen.css';

interface AudioTestScreenProps {
  onCanHear: () => void;
  onCannotHear: () => void;
}

export const AudioTestScreen: React.FC<AudioTestScreenProps> = ({ 
  onCanHear,
  onCannotHear 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  const handlePlayAudio = () => {
    setIsPlaying(true);
    setHasPlayed(true);
    
    // Play a test audio sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1.5);
    
    setTimeout(() => {
      setIsPlaying(false);
    }, 1500);
  };

  return (
    <NeoBackground glowIntensity="medium" showRings={true}>
      <div className="audio-test-screen" role="main" aria-label="Audio check">
        {/* Content */}
        <div className="audio-test-content">
          {/* Icon */}
          <div className="audio-test-icon-container">
            <Volume2 size={32} strokeWidth={1.5} />
          </div>

          {/* Text */}
          <h1 className="audio-test-title">Audio check</h1>
          <p className="audio-test-subtitle">
            Test your audio to ensure NEO's voice<br />comes through clearly
          </p>

          {/* Buttons */}
          <div className="audio-test-buttons">
            <button 
              className="neo-btn-secondary audio-test-play-btn"
              onClick={handlePlayAudio}
              disabled={isPlaying}
              aria-label={isPlaying ? "Playing test audio" : "Play test audio"}
            >
              <Volume2 size={18} />
              {isPlaying ? 'Playing...' : 'Play test audio'}
            </button>

            <button 
              className="neo-btn-success audio-test-confirm-btn"
              onClick={onCanHear}
              disabled={!hasPlayed}
              aria-label="I can hear the audio"
            >
              <Check size={18} />
              I can hear it
            </button>

            <button 
              className="neo-btn-secondary audio-test-deny-btn"
              onClick={onCannotHear}
              disabled={!hasPlayed}
              aria-label="I cannot hear the audio"
            >
              <X size={18} />
              I can't hear it
            </button>
          </div>
        </div>
      </div>
    </NeoBackground>
  );
};

export default AudioTestScreen;
