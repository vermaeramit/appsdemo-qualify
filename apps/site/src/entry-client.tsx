import './index.css';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The build pre-renders the page (hydrate it); the dev server serves an empty shell (render it).
if (root?.firstElementChild) hydrateRoot(root, app);
else if (root) createRoot(root).render(app);
