/**
 * Background Ellipsis Component
 * Renders the Figma-exported background gradient SVG.
 * Styles follow Figma "image 3" spec: 589x262px, centered, bottom-aligned, blur 18.7px.
 * CSS class: .neo-background-ellipsis (defined in theme.css)
 */

import React from 'react';
import backgroundSvg from './BackgroundEllipsis.svg';

interface BackgroundEllipsisProps {
  className?: string;
}

export const BackgroundEllipsis: React.FC<BackgroundEllipsisProps> = ({ className }) => {
  return (
    <div className={`neo-background-ellipsis ${className || ''}`} aria-hidden="true">
      <img src={backgroundSvg} alt="" />
    </div>
  );
};

export default BackgroundEllipsis;
