const axios = require('axios');

const BASE_URL = process.env.STEADFAST_BASE_URL || 'https://portal.packzy.com/api/v1';

function isConfigured() {
  return Boolean(process.env.STEADFAST_API_KEY && process.env.STEADFAST_SECRET_KEY);
}

function client() {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    headers: {
      'Api-Key': process.env.STEADFAST_API_KEY,
      'Secret-Key': process.env.STEADFAST_SECRET_KEY,
      'Content-Type': 'application/json',
    },
  });
}

// Wrap Steadfast's error shape into a normal Error with a readable message,
// so callers can just try/catch and forward err.message to the client.
function unwrap(promise) {
  return promise
    .then((res) => res.data)
    .catch((err) => {
      const data = err.response?.data;
      const fieldErrors =
        data?.errors && typeof data.errors === 'object'
          ? Object.entries(data.errors)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join(' · ')
          : '';
      const message =
        fieldErrors ||
        data?.message ||
        err.message ||
        'Steadfast API request failed';
      const wrapped = new Error(message);
      wrapped.statusCode = err.response?.status || 502;
      wrapped.steadfastResponse = data;
      throw wrapped;
    });
}

// payload: { invoice, recipient_name, recipient_phone, recipient_address,
//            cod_amount, note, item_description, total_lot, delivery_type,
//            alternative_phone, recipient_email }
const createOrder = (payload) => unwrap(client().post('/create_order', payload));

const createBulkOrder = (items) => unwrap(client().post('/create_order/bulk-order', { data: items }));

// Same as createBulkOrder but each failure comes back as readable sentences, not codes.
const createBulkOrderExtended = (items) => unwrap(client().post('/create_order/bulk-order/extended', { data: items }));

const statusByConsignmentId = (id) => unwrap(client().get(`/status_by_cid/${id}`));
const statusByInvoice = (invoice) => unwrap(client().get(`/status_by_invoice/${invoice}`));
const statusByTrackingCode = (code) => unwrap(client().get(`/status_by_trackingcode/${code}`));

const getBalance = () => unwrap(client().get('/get_balance'));

const createReturnRequest = (payload) => unwrap(client().post('/create_return_request', payload));
const getReturnRequest = (id) => unwrap(client().get(`/get_return_request/${id}`));
const getReturnRequests = () => unwrap(client().get('/get_return_requests'));

const getPoliceStations = () => unwrap(client().get('/police_stations'));

// Same answer as status_by_cid, but a parcel that is coming back also says how
// far back it has got (e.g. cancelled_return_rider_assigned).
const statusWithReturnByConsignmentId = (id) => unwrap(client().get(`/status_with_return_status_by_cid/${id}`));

// Every step a parcel has been through: { tracking: [{ text, created_at, ... }] }.
const trackingsByInvoice = (invoice) => unwrap(client().get(`/trackings_by_invoice/${encodeURIComponent(invoice)}`));

// Payouts Steadfast has made to us (paginated, ten a page).
const getPayments = (page = 1) => unwrap(client().get('/payments', { params: { page } }));
const getPayment = (id) => unwrap(client().get(`/payments/${String(id).replace(/\D/g, '')}`));

// Ask for a rider to collect: { address_id, police_station_id, address, contact_number, note?, estim_qty? }
const createPickupRequest = (payload) => unwrap(client().post('/create_pickup_request', payload));

// 0-100 delivery-risk score for a customer phone (replaces the old /fraud_check/{phone} counts,
// which stop working on 27 Sep 2026). score is null when nobody has history for the number.
const fraudScore = (phone) => unwrap(client().get(`/fraud_check/score/${phone}`));

module.exports = {
  isConfigured,
  createOrder,
  createBulkOrder,
  createBulkOrderExtended,
  statusByConsignmentId,
  statusByInvoice,
  statusByTrackingCode,
  getBalance,
  createReturnRequest,
  getReturnRequest,
  getReturnRequests,
  getPoliceStations,
  statusWithReturnByConsignmentId,
  trackingsByInvoice,
  getPayments,
  getPayment,
  createPickupRequest,
  fraudScore,
};
