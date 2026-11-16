/**
 * Splash Screen Component
 * Beautiful animated splash screen with NEO logo, spinner, and tagline
 * Shows for 5 seconds on app start with entrance/exit animations
 */

import React, { useEffect, useState } from 'react';
import { BackgroundEllipsis } from '../ui/BackgroundEllipsis';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { NeoLogo } from '../ui/NeoLogo';
import './SplashScreen.css';

interface SplashScreenProps {
  duration?: number; // Duration in ms before onComplete is called
  onComplete: () => void;
  className?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ 
  duration = 5000, 
  onComplete,
  className 
}) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');

  useEffect(() => {
    // Entrance animation complete after 800ms
    const entranceTimer = setTimeout(() => {
      setPhase('visible');
    }, 800);

    // Start exit animation 1 second before duration ends
    const exitTimer = setTimeout(() => {
      setPhase('exiting');
    }, duration - 1000);

    // Call onComplete when duration is reached
    const completeTimer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearTimeout(entranceTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <div className={`splash-screen splash-screen--${phase} ${className || ''}`}>
      {/* Animated background */}
      <div className="splash-screen__bg">
        <BackgroundEllipsis />
        {/* Extra glow layers for entrance effect */}
        <div className="splash-screen__glow splash-screen__glow--1" />
        <div className="splash-screen__glow splash-screen__glow--2" />
        <div className="splash-screen__glow splash-screen__glow--3" />
      </div>
      
      {/* Floating particles */}
      <div className="splash-screen__particles">
        {[...Array(12)].map((_, i) => (
          <div 
            key={i} 
            className="splash-screen__particle"
            style={{
              '--delay': `${i * 0.3}s`,
              '--x': `${Math.random() * 100}%`,
              '--duration': `${3 + Math.random() * 2}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Content */}
      <div className="splash-screen__content">
        {/* NEO Logo with entrance animation */}
        <div className="splash-screen__logo">
          <NeoLogo size="xl" />
        </div>
        
        {/* Spinner */}
        <div className="splash-screen__spinner-container">
          <LoadingSpinner size={40} />
        </div>
        
        {/* Tagline */}
        <div className="splash-screen__tagline-container">
          <span className="splash-screen__tagline">
            Voice-First AI Agent
          </span>
        </div>
      </div>

      {/* Vignette overlay for depth */}
      <div className="splash-screen__vignette" />
    </div>
  );
};

export default SplashScreen;
