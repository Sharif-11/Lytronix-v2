import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PhoneticProvider } from './context/PhoneticContext';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import { CartProvider } from './context/CartContext';
import { ConfirmProvider } from './context/ConfirmContext';
import './styles/index.css';

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
