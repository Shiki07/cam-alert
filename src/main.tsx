import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initializeHttpsOnlyModePrevention } from "./utils/preventHttpsOnlyMode.ts";

// Initialize HTTPS-Only mode prevention for camera proxy
initializeHttpsOnlyModePrevention();

createRoot(document.getElementById("root")!).render(<App />);
