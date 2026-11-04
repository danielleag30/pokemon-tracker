import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initNative } from './lib/native';

initNative();

// iOS only applies :active styles (the tap feedback in index.css) once the
// page has a touchstart listener. An empty passive one is the standard fix.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
