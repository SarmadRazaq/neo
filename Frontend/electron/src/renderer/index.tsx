import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('Neo AI: Initializing renderer...');

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('Neo AI: Root element not found!');
} else {
  console.log('Neo AI: Root element found, mounting React app...');
  
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('Neo AI: React app mounted successfully');
  } catch (error) {
    console.error('Neo AI: Failed to mount React app:', error);
  }
}

