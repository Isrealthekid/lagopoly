import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Administrator } from './components/Administrator';
import './styles.css';
import './monopoly.css';
import './classic-board.css';
import '@fontsource-variable/inter';
import './player-focus.css';
import './multiplayer.css';
import './board-depth.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{['/administrator','/administrator/create','/adminstrator','/adminstrator/create'].includes(location.pathname.replace(/\/$/,''))?<Administrator/>:<App/>}</React.StrictMode>,
);
