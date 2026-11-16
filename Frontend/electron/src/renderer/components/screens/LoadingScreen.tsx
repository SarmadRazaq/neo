/**
 * Loading Screen Component
 * Splash screen with NEO logo, spinner, and tagline
 * Layout: flex-column with 40px gap
 */

import React from 'react';
import { BackgroundEllipsis } from '../ui/BackgroundEllipsis';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { NeoLogo } from '../ui/NeoLogo';
import './LoadingScreen.css';

interface LoadingScreenProps {
  className?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ className }) => {
  return (
    <div className={`loading-screen ${className || ''}`}>
      {/* Background */}
      <BackgroundEllipsis />
      
      {/* Content */}
      <div className="loading-screen__content">
        {/* NEO Logo */}
        <div className="loading-screen__logo">
          <NeoLogo size="lg" />
        </div>
        
        {/* Spinner */}
        <LoadingSpinner size={35} />
        
        {/* Tagline */}
        <span className="loading-screen__tagline">
          Voice-First AI Agent
        </span>
      </div>
    </div>
  );
};

export default LoadingScreen;
