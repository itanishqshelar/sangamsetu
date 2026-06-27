import React from 'react';
import ReactDOM from 'react-dom/client';
import 'mapbox-gl/dist/mapbox-gl.css';
import App from './App';
import './index.css';
import { CenterProvider } from './context/CenterContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CenterProvider>
      <App />
    </CenterProvider>
  </React.StrictMode>,
);
