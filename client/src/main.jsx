import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import QuickPost from './components/QuickPost.jsx';

const params = new URLSearchParams(window.location.search);

const isQuickPost =
  window.location.pathname === '/quick-post' ||
  params.get('quickPost') === '1';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isQuickPost ? <QuickPost /> : <App />}
  </StrictMode>,
);
