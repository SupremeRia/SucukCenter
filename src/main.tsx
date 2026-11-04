import { applyAppearance } from './lib/appearance';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './design-system.css';
applyAppearance((window as Window & { initialAppearance?: string }).initialAppearance || 'classic');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
