import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeHttpsOnlyModePrevention } from "./utils/preventHttpsOnlyMode.ts";

// Prevent extension interference
window.addEventListener('error', (e) => {
  if (e.filename?.includes('moz-extension://')) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
});

// Initialize HTTPS-Only mode prevention for camera proxy
initializeHttpsOnlyModePrevention();

createRoot(document.getElementById("root")!).render(<App />);
