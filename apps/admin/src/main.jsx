import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PhoneticProvider } from './context/PhoneticContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from './context/LanguageContext';
import { ConfirmProvider } from './context/ConfirmContext';
import ErrorModalHost from './components/ErrorModal';
import { registerServiceWorker } from './lib/push';
import './styles/index.css';

// Register the push service worker as early as possible so an installed PWA
// can receive background notifications. Subscribing still requires the admin
// to opt in (NotificationBell → "Enable background alerts").
if ('serviceWorker' in navigator) registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <PhoneticProvider>
              <ConfirmProvider>
                <App />
                <ErrorModalHost />
              </ConfirmProvider>
            </PhoneticProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Dismiss the static index.html splash now that React has taken over —
// fades out instead of a hard cut so it still feels like one continuous
// app launch instead of a flash of blank white.
const splash = document.getElementById('app-splash');
if (splash) {
  requestAnimationFrame(() => {
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 400);
  });
}
