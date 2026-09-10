import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PhoneticProvider } from './context/PhoneticContext';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import { CartProvider } from './context/CartContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { registerServiceWorker } from './lib/push';
import './styles/index.css';

// Register the push service worker so an installed PWA can get order-update
// notifications. Subscribing still requires the shopper to opt in from their
// account page.
if ('serviceWorker' in navigator) registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PhoneticProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </CartProvider>
        </CustomerAuthProvider>
      </PhoneticProvider>
    </BrowserRouter>
  </React.StrictMode>
);
