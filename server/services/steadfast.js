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
      const message =
        data?.message ||
        (data?.errors && JSON.stringify(data.errors)) ||
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

const statusByConsignmentId = (id) => unwrap(client().get(`/status_by_cid/${id}`));
const statusByInvoice = (invoice) => unwrap(client().get(`/status_by_invoice/${invoice}`));
const statusByTrackingCode = (code) => unwrap(client().get(`/status_by_trackingcode/${code}`));

const getBalance = () => unwrap(client().get('/get_balance'));

const createReturnRequest = (payload) => unwrap(client().post('/create_return_request', payload));
const getReturnRequest = (id) => unwrap(client().get(`/get_return_request/${id}`));
const getReturnRequests = () => unwrap(client().get('/get_return_requests'));

const getPoliceStations = () => unwrap(client().get('/police_stations'));

module.exports = {
  isConfigured,
  createOrder,
  createBulkOrder,
  statusByConsignmentId,
  statusByInvoice,
  statusByTrackingCode,
  getBalance,
  createReturnRequest,
  getReturnRequest,
  getReturnRequests,
  getPoliceStations,
};
