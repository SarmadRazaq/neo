import React, { useRef, useEffect } from 'react';
import './VideoOrb.css';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VideoOrbProps {
  state?: OrbState;
  size?: number;
  className?: string;
}

// Import the video - webpack will handle this
const videoSrc = require('../../../../assets/AI agent.mov');

export const VideoOrb: React.FC<VideoOrbProps> = ({ 
  state = 'idle', 
  size = 200,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Adjust playback rate based on state
  useEffect(() => {
    if (videoRef.current) {
      switch (state) {
        case 'idle':
          videoRef.current.playbackRate = 0.8;
          break;
        case 'listening':
          videoRef.current.playbackRate = 1.0;
          break;
        case 'processing':
          videoRef.current.playbackRate = 1.2;
          break;
        case 'speaking':
          videoRef.current.playbackRate = 1.0;
          break;
        default:
          videoRef.current.playbackRate = 1.0;
      }
    }
  }, [state]);

  return (
    <div 
      className={`video-orb-container video-orb-state-${state} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Voice assistant is ${state}`}
    >
      <video
        ref={videoRef}
        className="video-orb"
        src={videoSrc}
        autoPlay
        loop
        muted
        playsInline
      />
      {/* Optional glow overlay based on state */}
      <div className="video-orb-glow" />
    </div>
  );
};

export default VideoOrb;
