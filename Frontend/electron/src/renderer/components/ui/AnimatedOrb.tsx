import React from 'react';
import './AnimatedOrb.css';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

interface AnimatedOrbProps {
  state?: OrbState;
  size?: number;
  className?: string;
}

export const AnimatedOrb: React.FC<AnimatedOrbProps> = ({ 
  state = 'idle', 
  size = 200,
  className = ''
}) => {
  return (
    <div 
      className={`orb-container orb-state-${state} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Voice assistant is ${state}`}
    >
      {/* Outer glow layer */}
      <div className="orb-glow-outer" />
      
      {/* Middle glow layer */}
      <div className="orb-glow-middle" />
      
      {/* Main orb body */}
      <div className="orb-body">
        {/* Inner core glow */}
        <div className="orb-core" />
        
        {/* Flowing wave lines */}
        <svg 
          className="orb-waves" 
          viewBox="0 0 200 200" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradient for waves */}
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0, 212, 255, 0.8)" />
              <stop offset="50%" stopColor="rgba(0, 136, 204, 0.6)" />
              <stop offset="100%" stopColor="rgba(0, 212, 255, 0.8)" />
            </linearGradient>
            
            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Animated wave paths */}
          <g className="wave-group" filter="url(#glow)">
            {/* Wave 1 - outer */}
            <path 
              className="wave wave-1"
              d="M 100 30 
                 Q 140 50, 160 100 
                 Q 140 150, 100 170 
                 Q 60 150, 40 100 
                 Q 60 50, 100 30"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
            />
            
            {/* Wave 2 - middle */}
            <path 
              className="wave wave-2"
              d="M 100 45 
                 Q 130 60, 145 100 
                 Q 130 140, 100 155 
                 Q 70 140, 55 100 
                 Q 70 60, 100 45"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
            />
            
            {/* Wave 3 - inner */}
            <path 
              className="wave wave-3"
              d="M 100 60 
                 Q 120 70, 130 100 
                 Q 120 130, 100 140 
                 Q 80 130, 70 100 
                 Q 80 70, 100 60"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
            />
            
            {/* Horizontal flow line */}
            <path 
              className="wave wave-horizontal"
              d="M 35 100 Q 70 85, 100 100 Q 130 115, 165 100"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
            />
            
            {/* Diagonal flow lines */}
            <path 
              className="wave wave-diagonal-1"
              d="M 50 50 Q 100 80, 150 50"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1"
              opacity="0.6"
            />
            <path 
              className="wave wave-diagonal-2"
              d="M 50 150 Q 100 120, 150 150"
              fill="none"
              stroke="url(#waveGradient)"
              strokeWidth="1"
              opacity="0.6"
            />
          </g>
        </svg>
        
        {/* Highlight reflection */}
        <div className="orb-highlight" />
      </div>
      
      {/* Particle effects for speaking state */}
      <div className="orb-particles">
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`} />
        ))}
      </div>
    </div>
  );
};

export default AnimatedOrb;

