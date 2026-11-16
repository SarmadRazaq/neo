import React, { useState } from 'react';
import { AnimatedOrb, OrbState } from './AnimatedOrb';
import { NeoBackground } from './NeoBackground';
import './OrbDemo.css';

/**
 * Demo component to preview all orb states
 * Remove this file before production
 */
export const OrbDemo: React.FC = () => {
  const [activeState, setActiveState] = useState<OrbState>('idle');
  
  const states: OrbState[] = ['idle', 'listening', 'processing', 'speaking'];

  return (
    <NeoBackground glowIntensity="medium" showRings={false}>
      <div className="orb-demo">
        <h2>Animated Orb Preview</h2>
        
        {/* Main preview */}
        <div className="orb-demo-preview">
          <AnimatedOrb state={activeState} size={200} />
          <p className="orb-demo-state-label">{activeState}</p>
        </div>
        
        {/* State selector */}
        <div className="orb-demo-controls">
          {states.map((state) => (
            <button
              key={state}
              className={`orb-demo-btn ${activeState === state ? 'active' : ''}`}
              onClick={() => setActiveState(state)}
            >
              {state}
            </button>
          ))}
        </div>
        
        {/* All states side by side */}
        <div className="orb-demo-grid">
          {states.map((state) => (
            <div key={state} className="orb-demo-item">
              <AnimatedOrb state={state} size={120} />
              <span>{state}</span>
            </div>
          ))}
        </div>
      </div>
    </NeoBackground>
  );
};

export default OrbDemo;
