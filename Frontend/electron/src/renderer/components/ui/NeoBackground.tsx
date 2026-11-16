import React from 'react';
import { BackgroundEllipsis } from './BackgroundEllipsis';
import './NeoBackground.css';

interface NeoBackgroundProps {
  /** Show the bottom ellipsis glow and gradient effects. Default: true */
  showEffects?: boolean;
  /** @deprecated No longer used - kept for backward compatibility */
  glowIntensity?: 'low' | 'medium' | 'high';
  /** @deprecated No longer used - kept for backward compatibility */
  showRings?: boolean;
  children?: React.ReactNode;
}

export const NeoBackground: React.FC<NeoBackgroundProps> = ({ 
  showEffects = true,
  children 
}) => {
  return (
    <div className="neo-background">
      {/* Background gradient ellipses (Figma spec) - only when effects enabled */}
      {showEffects && (
        <div className="neo-bg-gradient" aria-hidden="true">
          <div className="neo-bg-ellipse-1" />
          <div className="neo-bg-ellipse-2" />
          <div className="neo-bg-ellipse-3" />
          <div className="neo-bg-ellipse-4" />
        </div>
      )}
      
      {/* Bottom ellipsis glow (Figma SVG) - only when effects enabled */}
      {showEffects && <BackgroundEllipsis />}
      
      {/* Content */}
      <div className="neo-bg-content">
        {children}
      </div>
    </div>
  );
};

export default NeoBackground;

