/**
 * Loading Spinner Component
 * Renders the Figma-exported spinner SVG with rotation animation
 */

import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 35, 
  className 
}) => {
  return (
    <div 
      className={`neo-loading-spinner ${className || ''}`}
      style={{ width: size, height: size }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 39 39" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M24.3026 2.67188C20.4093 1.56079 16.2512 1.83402 12.5368 3.445C8.82241 5.05598 5.7815 7.90505 3.93222 11.5068C2.08294 15.1085 1.53971 19.2399 2.39509 23.1973C3.25047 27.1546 5.45153 30.6929 8.62325 33.2093C11.795 35.7257 15.7411 37.0645 19.7892 36.9976C23.8374 36.9307 27.7371 35.4622 30.8239 32.8424C33.9108 30.2225 35.9937 26.6134 36.7178 22.63" 
          stroke="url(#spinner-gradient)" 
          strokeWidth="4" 
          strokeLinecap="round"
        />
        <defs>
          <linearGradient 
            id="spinner-gradient" 
            x1="2.67192" 
            y1="14.6975" 
            x2="36.3282" 
            y2="24.3025" 
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#06B6D4"/>
            <stop offset="1" stopColor="#67E8F9"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

export default LoadingSpinner;
