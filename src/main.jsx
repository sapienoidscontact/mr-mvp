import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

console.log('[DIAGNOSTIC] main.jsx: React app starting to mount');
console.log('[DIAGNOSTIC] main.jsx: VITE_APPS_SCRIPT_URL =', import.meta.env.VITE_APPS_SCRIPT_URL);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
