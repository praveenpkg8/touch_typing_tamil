import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App.tsx';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
