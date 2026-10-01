import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './monopoly.css';
import './classic-board.css';
import '@fontsource-variable/inter';
import './player-focus.css';
import './multiplayer.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
