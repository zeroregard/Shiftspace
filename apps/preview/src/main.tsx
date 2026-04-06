import { installSeededRandom } from './mock/seed';

// Must run before any module-level code calls Math.random
installSeededRandom();

import './styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SidebarPage } from './SidebarPage';
import { LoaderPage } from './LoaderPage';

const route = window.location.pathname;

const Page = route === '/sidebar' ? SidebarPage : route === '/loader' ? LoaderPage : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
