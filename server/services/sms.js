const axios = require('axios');

const BASE_URL = process.env.SMS_BASE_URL || 'http://bulksmsbd.net/api/smsapi';

function isConfigured() {
  return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}

// BulkSMSBD wants an 11-digit local number (01XXXXXXXXX). Accepts inputs
// like "+8801XXXXXXXXX" or "8801XXXXXXXXX" too and normalizes them.
function normalizeBdNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('880')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits;
  return digits;
}

// Sends one SMS via BulkSMSBD. Never throws — callers get back a result
// object and decide what to do; a failed SMS should never break the order
// flow it was triggered from.
async function sendSms(rawNumber, message) {
  if (!isConfigured()) {
    return {
      success: false,
      responseCode: null,
      raw: null,
      error: 'SMS gateway not configured (set SMS_API_KEY / SMS_SENDER_ID in server/.env).',
    };
  }

  const number = normalizeBdNumber(rawNumber);
  if (number.length !== 11) {
    return { success: false, responseCode: null, raw: null, error: `Invalid BD phone number: "${rawNumber}"` };
  }

  try {
    const response = await axios.get(BASE_URL, {
      params: {
        api_key: process.env.SMS_API_KEY,
        type: 'text',
        number,
        senderid: process.env.SMS_SENDER_ID,
        message,
      },
      timeout: 10000,
    });

    const data = response.data;
    // BulkSMSBD responds with e.g. { response_code: 202, message_id, success_message }
    const responseCode = typeof data === 'object' && data !== null ? Number(data.response_code) : null;
    const success = responseCode === 202;
    return { success, responseCode, raw: data, error: success ? '' : describeCode(responseCode, data) };
  } catch (err) {
    return {
      success: false,
      responseCode: null,
      raw: err.response?.data || null,
      error: err.message,
    };
  }
}

// BulkSMSBD's "one message, many recipients" mode: pass a comma-separated
// list of numbers in the same `number` field as a single SMS request instead
// of calling the single-send endpoint once per recipient. Chunked so one
// broadcast to a large list doesn't build one enormous URL/request.
const BULK_CHUNK_SIZE = 200;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Sends the same message to many numbers at once. Never throws — returns
// { success, sent: [...], failed: [{ number, error }], responseCode, error }
// for the batch, mirroring sendSms's "callers decide what to do" contract.
async function sendBulkSms(rawNumbers, message) {
  const numbers = [...new Set((rawNumbers || []).map(normalizeBdNumber).filter((n) => n.length === 11))];
  const invalid = (rawNumbers || []).filter((n) => normalizeBdNumber(n).length !== 11);

  if (!isConfigured()) {
    return {
      success: false,
      sent: [],
      failed: [...numbers, ...invalid].map((number) => ({ number, error: 'SMS gateway not configured.' })),
      error: 'SMS gateway not configured (set SMS_API_KEY / SMS_SENDER_ID in server/.env).',
    };
  }
  if (numbers.length === 0) {
    return { success: false, sent: [], failed: invalid.map((number) => ({ number, error: 'Invalid number' })), error: 'No valid numbers to send to.' };
  }

  const sent = [];
  const failed = invalid.map((number) => ({ number, error: 'Invalid BD phone number' }));
  let lastError = '';
  let lastResponseCode = null;

  for (const batch of chunk(numbers, BULK_CHUNK_SIZE)) {
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          api_key: process.env.SMS_API_KEY,
          type: 'text',
          number: batch.join(','),
          senderid: process.env.SMS_SENDER_ID,
          message,
        },
        timeout: 20000,
      });
      const data = response.data;
      const responseCode = typeof data === 'object' && data !== null ? Number(data.response_code) : null;
      lastResponseCode = responseCode;
      if (responseCode === 202) {
        sent.push(...batch);
      } else {
        lastError = describeCode(responseCode, data);
        failed.push(...batch.map((number) => ({ number, error: lastError })));
      }
    } catch (err) {
      lastError = err.message;
      failed.push(...batch.map((number) => ({ number, error: err.message })));
    }
  }

  return {
    success: sent.length > 0,
    sent,
    failed,
    responseCode: lastResponseCode,
    error: sent.length === 0 ? lastError : '',
  };
}

const CODE_MEANINGS = {
  1001: 'Invalid Number',
  1002: 'Sender ID not correct / disabled',
  1003: 'Missing required fields',
  1005: 'Internal error at BulkSMSBD',
  1006: 'Balance validity not available',
  1007: 'Insufficient balance',
  1011: 'User ID not found',
  1018: 'Account disabled',
  1031: 'Account not verified',
  1032: 'IP not whitelisted',
};

function describeCode(code, data) {
  return CODE_MEANINGS[code] || data?.error_message || `Gateway returned code ${code}`;
}

const BALANCE_URL = 'http://bulksmsbd.net/api/getBalanceApi';

// Remaining SMS credit on the BulkSMSBD account (separate from the Steadfast
// courier balance). Never throws — returns { balance: number|null, raw, error }.
async function getBalance() {
  if (!isConfigured()) {
    return { balance: null, raw: null, error: 'SMS gateway not configured.' };
  }
  try {
    const response = await axios.get(BALANCE_URL, {
      params: { api_key: process.env.SMS_API_KEY },
      timeout: 10000,
    });
    const data = response.data;
    // BulkSMSBD's balance payload shape isn't formally documented beyond the
    // URL — accept whichever numeric field it comes back as.
    const balance =
      typeof data === 'number'
        ? data
        : Number(data?.balance ?? data?.data ?? data?.current_balance ?? NaN);
    return { balance: Number.isFinite(balance) ? balance : null, raw: data, error: '' };
  } catch (err) {
    return { balance: null, raw: err.response?.data || null, error: err.message };
  }
}

module.exports = { sendSms, sendBulkSms, getBalance, isConfigured, normalizeBdNumber };
