import axios from 'axios';
import { emitError } from '../lib/errorBus';

// In dev, Vite proxies /api -> http://localhost:5000 (see vite.config.js).
// In production, set VITE_API_URL to the deployed API's base URL.
const baseURL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({ baseURL });

// Attach the logged-in admin's token to every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('lytronix_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function forceLogout() {
  localStorage.removeItem('lytronix_token');
  localStorage.removeItem('lytronix_user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// A single 401 is not proof the session is dead — under load the API can
// briefly 401 on a transient DB/infra hiccup, and with many background polls
// running that used to boot the admin to /login mid-task. So on a 401 we
// verify once against /auth/me (deduped across concurrent failures): only if
// that ALSO 401s do we actually log out. A network error on the check leaves
// the session intact.
let sessionCheck = null;

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config || {};
    const status = err.response?.status;

    if (status === 401 && !cfg._authCheck) {
      // No token at all → nothing to salvage. Opt-out flag skips the redirect
      // entirely (used by passive pollers that must never yank the page).
      if (!localStorage.getItem('lytronix_token')) {
        if (!cfg.skipAuthLogout) forceLogout();
        return Promise.reject(err);
      }
      try {
        sessionCheck =
          sessionCheck || client.get('/auth/me', { _authCheck: true, skipErrorModal: true });
        await sessionCheck;
        sessionCheck = null;
        // Session still good — surface the original error but stay logged in.
        return Promise.reject(err);
      } catch (checkErr) {
        sessionCheck = null;
        if (checkErr.response?.status === 401 && !cfg.skipAuthLogout) forceLogout();
        return Promise.reject(err);
      }
    }

    // Every other failed request surfaces as a proper modal (see
    // ErrorModalHost) instead of a bare inline red box — a call site can
    // opt out with { skipErrorModal: true } in the axios config when it
    // wants to handle the error entirely on its own (e.g. inline field
    // validation from the server).
    if (!cfg.skipErrorModal && !cfg._authCheck && !axios.isCancel(err)) {
      const message =
        err.response?.data?.message ||
        (err.request && !err.response ? 'Could not reach the server. Check your connection and try again.' : 'Something went wrong. Please try again.');
      emitError(message);
    }
    return Promise.reject(err);
  }
);

export default client;

// ---- Auth ----
// `identifier` is an email or a phone number — phone is the one field every
// admin account is guaranteed to have.
// The login screen renders its own inline errors, so suppress the global
// error modal and the 401 auto-logout dance for these two calls.
export const login = (identifier, password) =>
  client
    .post('/auth/login', { identifier, password }, { skipErrorModal: true, skipAuthLogout: true })
    .then((r) => r.data);
export const forgotPassword = (identifier) =>
  client
    .post('/auth/forgot-password', { identifier }, { skipErrorModal: true, skipAuthLogout: true })
    .then((r) => r.data);
export const getMe = () => client.get('/auth/me').then((r) => r.data);
export const changePassword = (data) => client.post('/auth/change-password', data).then((r) => r.data);

// ---- Users (staff accounts) ----
export const getUsers = () => client.get('/users').then((r) => r.data);
export const createUser = (data) => client.post('/users', data).then((r) => r.data);
export const updateUserAccount = (id, data) => client.put(`/users/${id}`, data).then((r) => r.data);
export const deleteUserAccount = (id) => client.delete(`/users/${id}`).then((r) => r.data);

// ---- Roles ----
export const getRoles = () => client.get('/roles').then((r) => r.data);
export const createRole = (data) => client.post('/roles', data).then((r) => r.data);
export const updateRole = (id, data) => client.put(`/roles/${id}`, data).then((r) => r.data);
export const deleteRole = (id) => client.delete(`/roles/${id}`).then((r) => r.data);

// ---- Products ----
// The API now returns { products, total, page, pages }. Callers that just want
// the list (order form catalogue picker, etc.) use getProducts and get the
// array; the catalogue page uses listProducts for pagination metadata.
export const listProducts = (params) => client.get('/products', { params }).then((r) => r.data);
export const getProducts = (params) =>
  client.get('/products', { params: { all: 'true', ...params } }).then((r) => r.data.products);
export const getProduct = (id) => client.get(`/products/${id}`).then((r) => r.data);
export const createProduct = (data) => client.post('/products', data).then((r) => r.data);
export const updateProduct = (id, data) => client.put(`/products/${id}`, data).then((r) => r.data);
export const deleteProduct = (id) => client.delete(`/products/${id}`).then((r) => r.data);

// ---- Categories ----
export const getCategories = (params) => client.get('/categories', { params }).then((r) => r.data);
export const getCategory = (idOrSlug) => client.get(`/categories/${idOrSlug}`).then((r) => r.data);
export const createCategory = (data) => client.post('/categories', data).then((r) => r.data);
export const updateCategory = (id, data) => client.put(`/categories/${id}`, data).then((r) => r.data);
export const deleteCategory = (id, reassignTo, config) =>
  client
    .delete(`/categories/${id}`, { params: reassignTo ? { reassignTo } : undefined, ...config })
    .then((r) => r.data);
export const reorderCategories = (updates) =>
  client.patch('/categories/reorder', updates).then((r) => r.data);

// ---- Analytics ----
export const getAnalyticsOverview = (range) =>
  client.get('/analytics/overview', { params: { range } }).then((r) => r.data);
export const getTopProducts = (params) =>
  client.get('/analytics/top-products', { params }).then((r) => r.data);
export const getTopCategories = (params) =>
  client.get('/analytics/top-categories', { params }).then((r) => r.data);

// ---- Uploads (generic catalogue image, e.g. category art) ----
export const uploadImage = (file) => {
  const form = new FormData();
  form.append('image', file);
  return client
    .post('/uploads/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

// ---- Orders ----
export const getOrders = (params) => client.get('/orders', { params }).then((r) => r.data);
export const getAllOrders = (params) => client.get('/orders', { params: { ...params, all: true } }).then((r) => r.data);
export const getOrderStats = () => client.get('/orders/stats').then((r) => r.data);
export const getOrder = (id) => client.get(`/orders/${id}`).then((r) => r.data);
export const createOrder = (data) => client.post('/orders', data).then((r) => r.data);
export const updateOrder = (id, data) => client.put(`/orders/${id}`, data).then((r) => r.data);
export const updateOrderStatus = (id, data) => client.patch(`/orders/${id}/status`, data).then((r) => r.data);
export const addPayment = (id, data) => client.post(`/orders/${id}/payments`, data).then((r) => r.data);
export const deletePayment = (id, paymentId) =>
  client.delete(`/orders/${id}/payments/${paymentId}`).then((r) => r.data);
export const deleteOrder = (id) => client.delete(`/orders/${id}`).then((r) => r.data);
export const bookSteadfastParcel = (id) => client.post(`/orders/${id}/steadfast/book`).then((r) => r.data);
export const syncSteadfastStatus = (id, config) => client.post(`/orders/${id}/steadfast/sync`, undefined, config).then((r) => r.data);
export const sendOrderMessage = (id, message) => client.post(`/orders/${id}/message`, { message }).then((r) => r.data);

// ---- Customers ----
export const getCustomers = (params) => client.get('/customers', { params }).then((r) => r.data);
export const getCustomer = (id) => client.get(`/customers/${id}`).then((r) => r.data);
export const createCustomer = (data) => client.post('/customers', data).then((r) => r.data);
export const updateCustomer = (id, data) => client.put(`/customers/${id}`, data).then((r) => r.data);
export const deleteCustomer = (id) => client.delete(`/customers/${id}`).then((r) => r.data);

// ---- Marketing SMS ----
export const sendCustomerMessage = (customerId, message) =>
  client.post('/customers/message', { customerId, message }).then((r) => r.data);
export const sendBroadcast = (customerIds, message) =>
  client.post('/customers/broadcast', { customerIds, message }).then((r) => r.data);

// Storefront login-OTP rate-limit tools (keyed by phone number).
export const getOtpStatus = (phone) =>
  client.get('/customers/otp-status', { params: { phone }, skipErrorModal: true }).then((r) => r.data);
export const resetOtpLimit = (phone) =>
  client.post('/customers/otp-reset', { phone }).then((r) => r.data);

// ---- Notifications ----
export const getNotifications = (params) =>
  client.get('/notifications', { params }).then((r) => r.data);
export const markNotificationsRead = (ids) =>
  client.post('/notifications/read', { ids }).then((r) => r.data);
export const markAllNotificationsRead = () =>
  client.post('/notifications/read-all').then((r) => r.data);

// ---- Web Push (admin PWA background notifications) ----
export const getPushConfig = () => client.get('/push/config').then((r) => r.data);
export const savePushSubscription = (subscription) =>
  client.post('/push/subscribe', { subscription }).then((r) => r.data);
export const deletePushSubscription = (endpoint) =>
  client.post('/push/unsubscribe', { endpoint }).then((r) => r.data);
export const sendTestPush = () => client.post('/push/test').then((r) => r.data);

// ---- AI-assisted order extraction ----
export const aiExtractOrder = (payload) =>
  client.post('/orders/ai-extract', payload).then((r) => r.data);

// ---- Meta ----
export const getSuggestedStatuses = () => client.get('/meta/statuses').then((r) => r.data);
export const getSteadfastMeta = () => client.get('/meta/steadfast').then((r) => r.data);

// Districts + police stations (Packzy). Our backend already caches the
// upstream call for hours, but we also keep it in memory on the frontend
// so navigating between pages in the same session doesn't even hit our
// own API again.
let _policeStationsCache = null;
let _policeStationsCacheAt = 0;
const POLICE_STATIONS_FRONTEND_TTL = 30 * 60 * 1000; // 30 minutes

export const getPoliceStations = async () => {
  const isFresh = _policeStationsCache && Date.now() - _policeStationsCacheAt < POLICE_STATIONS_FRONTEND_TTL;
  if (isFresh) return _policeStationsCache;

  const data = await client.get('/meta/police-stations').then((r) => r.data);
  _policeStationsCache = data.districts || [];
  _policeStationsCacheAt = Date.now();
  return _policeStationsCache;
};

// ---- Couriers ----
export const getSteadfastBalance = () => client.get('/couriers/steadfast/balance').then((r) => r.data);

// ---- Uploads (Cloudinary) ----
export const uploadProductImage = (file, config) => {
  const form = new FormData();
  form.append('image', file);
  return client
    .post('/uploads/product-image', form, { headers: { 'Content-Type': 'multipart/form-data' }, ...config })
    .then((r) => r.data);
};
export const uploadProductVideo = (file, config) => {
  const form = new FormData();
  form.append('video', file);
  return client
    .post('/uploads/product-video', form, { headers: { 'Content-Type': 'multipart/form-data' }, ...config })
    .then((r) => r.data);
};
// Deletes whatever Cloudinary asset a stored URL points to (image or video).
// Best-effort on the caller's side too — a failed cleanup call shouldn't
// block removing the item from the form.
export const deleteCloudinaryAsset = (url) =>
  client.delete('/uploads', { data: { url } }).then((r) => r.data);

// ---- Payments ----
export const getPayments = (params) => client.get('/payments', { params }).then((r) => r.data);
export const getPayment = (id) => client.get(`/payments/${id}`).then((r) => r.data);
export const verifyPayment = (id, data) => client.patch(`/payments/${id}/verify`, data).then((r) => r.data);
export const rejectPayment = (id, reason) => client.patch(`/payments/${id}/reject`, { reason }).then((r) => r.data);

// ---- SMS logs ----
export const getSmsLogs = (orderId) => client.get('/sms-logs', { params: { order: orderId } }).then((r) => r.data);
// skipErrorModal: the SMS credit chip is passive background chrome — a
// failed balance check is shown inline on the Marketing page, not as a modal.
export const getSmsBalance = () => client.get('/sms-logs/balance', { skipErrorModal: true }).then((r) => r.data);

// ---- Contact messages (from the storefront Contact page) ----
export const getContactMessages = (params) => client.get('/contact', { params }).then((r) => r.data);
export const updateContactMessage = (id, status) => client.patch(`/contact/${id}`, { status }).then((r) => r.data);
export const deleteContactMessage = (id) => client.delete(`/contact/${id}`).then((r) => r.data);

// ---- Live chat (customer ↔ admin, grouped by phone) ----
export const getChatThreads = (params) =>
  client.get('/chat/threads', { params, skipErrorModal: true }).then((r) => r.data);
export const getChatMessages = (phone, params) =>
  client.get(`/chat/threads/${phone}/messages`, { params, skipErrorModal: true }).then((r) => r.data);
export const sendChatMessage = (phone, payload) =>
  client.post(`/chat/threads/${phone}/messages`, payload).then((r) => r.data);
export const editChatMessage = (phone, id, body) =>
  client.patch(`/chat/threads/${phone}/messages/${id}`, { body }).then((r) => r.data);
export const deleteChatMessage = (phone, id) =>
  client.delete(`/chat/threads/${phone}/messages/${id}`).then((r) => r.data);
export const updateChatThread = (phone, status) =>
  client.patch(`/chat/threads/${phone}`, { status }).then((r) => r.data);
export const uploadChatMedia = (file, config) => {
  const form = new FormData();
  form.append('file', file);
  return client
    .post('/chat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, ...config })
    .then((r) => r.data);
};

// ---- Public tracking ----
// skipErrorModal: a wrong/unknown tracking id is an expected outcome here,
// shown inline on the page itself — not a failure worth a popup.
export const trackOrder = (trackingId) =>
  client.get(`/track/${trackingId}`, { skipErrorModal: true }).then((r) => r.data);
