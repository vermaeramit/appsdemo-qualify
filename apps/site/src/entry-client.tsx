import './index.css';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import { pageForPath } from './pages';

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <App page={pageForPath(window.location.pathname).id} />
  </StrictMode>
);
// The build pre-renders each page (hydrate it); the dev server serves an empty shell (render it).
if (root?.firstElementChild) hydrateRoot(root, app);
else if (root) createRoot(root).render(app);
