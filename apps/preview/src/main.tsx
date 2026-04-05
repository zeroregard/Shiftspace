import './styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SidebarPage } from './SidebarPage';

const route = window.location.pathname;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {route === '/sidebar' ? <SidebarPage /> : <App />}
  </React.StrictMode>
);
