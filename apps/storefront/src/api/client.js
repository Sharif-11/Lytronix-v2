import axios from 'axios';

// In dev, Vite proxies /api -> http://localhost:5000 (see vite.config.js).
// In production, set VITE_API_URL to the deployed API's base URL.
const baseURL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({ baseURL });

export const SHOP_TOKEN_KEY = 'lytronix_shop_token';

// Attach the signed-in customer's token (if any) to every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(SHOP_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on an /account/* call means the session lapsed — clear it so the UI
// falls back to the guest experience instead of looping on errors.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && url.includes('/account')) {
      localStorage.removeItem(SHOP_TOKEN_KEY);
    }
    return Promise.reject(err);
  }
);

export default client;

// ---- Catalogue ----
export const getProducts = (params) => client.get('/products', { params }).then((r) => r.data);
export const getProduct = (idOrSlug) => client.get(`/products/${idOrSlug}`).then((r) => r.data);
export const recordProductView = (id, body) =>
  client.post(`/products/${id}/view`, body).then((r) => r.data).catch(() => null);

export const getCategories = (params) => client.get('/categories', { params }).then((r) => r.data);
export const getCategory = (slug) => client.get(`/categories/${slug}`).then((r) => r.data);

// ---- Customer auth (phone + OTP) ----
export const requestOtp = (phone) =>
  client.post('/auth/customer/request-otp', { phone }).then((r) => r.data);
export const verifyOtp = (phone, code) =>
  client.post('/auth/customer/verify-otp', { phone, code }).then((r) => r.data);

// ---- Account ----
export const getMe = () => client.get('/account/me').then((r) => r.data);
export const updateProfile = (data) => client.patch('/account/profile', data).then((r) => r.data);
export const addAddress = (data) => client.post('/account/addresses', data).then((r) => r.data);
export const updateAddress = (id, data) =>
  client.patch(`/account/addresses/${id}`, data).then((r) => r.data);
export const deleteAddress = (id) => client.delete(`/account/addresses/${id}`).then((r) => r.data);

export const getMyOrders = () => client.get('/account/orders').then((r) => r.data);
export const getMyOrder = (id) => client.get(`/account/orders/${id}`).then((r) => r.data);
export const getMyPayments = () => client.get('/account/payments').then((r) => r.data);

// ---- Cart (server, signed-in only) ----
export const getServerCart = () => client.get('/account/cart').then((r) => r.data);
export const mergeServerCart = (items) =>
  client.post('/account/cart/merge', { items }).then((r) => r.data);
export const addServerCartItem = (productId, quantity) =>
  client.post('/account/cart/items', { productId, quantity }).then((r) => r.data);
export const setServerCartItem = (productId, quantity) =>
  client.patch(`/account/cart/items/${productId}`, { quantity }).then((r) => r.data);
export const removeServerCartItem = (productId) =>
  client.delete(`/account/cart/items/${productId}`).then((r) => r.data);
export const replaceServerCart = (items) =>
  client.put('/account/cart', { items }).then((r) => r.data);

// ---- Wishlist / saved products ----
export const getWishlist = () => client.get('/account/wishlist').then((r) => r.data);
export const getWishlistIds = () => client.get('/account/wishlist/ids').then((r) => r.data);
export const addToWishlist = (productId) =>
  client.post(`/account/wishlist/${productId}`).then((r) => r.data);
export const removeFromWishlist = (productId) =>
  client.delete(`/account/wishlist/${productId}`).then((r) => r.data);

// ---- Orders (guest or signed-in checkout) ----
export const createOrder = (data) => client.post('/orders', data).then((r) => r.data);
export const uploadPaymentProof = (file) => {
  const form = new FormData();
  form.append('image', file);
  return client
    .post('/uploads/payment-proof', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};
export const initiateBkashCheckout = (orderId) =>
  client.post(`/orders/${orderId}/payments/bkash/initiate`).then((r) => r.data);

// ---- Contact ----
export const submitContact = (data) => client.post('/contact', data).then((r) => r.data);

// ---- Analytics ----
export const trackEvent = (payload) =>
  client.post('/analytics/track', payload).then((r) => r.data).catch(() => null);

// ---- Meta: districts + police stations (cached upstream; also cached here) ----
let _psCache = null;
let _psCacheAt = 0;
const PS_TTL = 30 * 60 * 1000;
export const getPoliceStations = async () => {
  if (_psCache && Date.now() - _psCacheAt < PS_TTL) return _psCache;
  const data = await client.get('/meta/police-stations').then((r) => r.data);
  _psCache = data.districts || [];
  _psCacheAt = Date.now();
  return _psCache;
};

// ---- Public order tracking ----
export const trackOrder = (trackingId) => client.get(`/track/${trackingId}`).then((r) => r.data);
