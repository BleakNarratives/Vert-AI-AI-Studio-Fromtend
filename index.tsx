import React from 'react';
import ReactDOM from 'react-dom/client'; // Changed to import from 'react-dom/client'
import App from './App';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);