const smsGateway = require('./sms');
const SmsLog = require('../models/SmsLog');
const logger = require('./logger');

// Sends one SMS and unconditionally writes an SmsLog entry, whether it
// succeeded or not, so every notification attempt is auditable from the
// admin panel (SmsLog is the source of truth; the winston line below is
// for tailing/grepping the server's own logs).
async function sendAndLog({ to, message, purpose, orderId = null }) {
  const result = await smsGateway.sendSms(to, message);

  logger[result.success ? 'info' : 'warn']('sms: send attempt', {
    to,
    purpose,
    success: result.success,
    responseCode: result.responseCode,
    error: result.error || undefined,
  });

  // Dev convenience only: the actual message text (OTP codes, reset
  // passwords, order confirmations...) is never logged in production, since
  // it can contain sensitive one-time codes. In dev it's printed so you can
  // read an OTP/reset password off the console without a working SMS gateway.
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`sms body → ${to} [${purpose}]: ${message}`);
  }

  try {
    await SmsLog.create({
      to,
      message,
      purpose,
      order: orderId,
      status: result.success ? 'sent' : 'failed',
      responseCode: result.responseCode,
      providerResponse: result.raw,
      error: result.error || '',
    });
  } catch (logErr) {
    // Logging failure should never mask the original send result.
    logger.error('Failed to write SmsLog', { error: logErr.message });
  }

  if (!result.success) {
    console.error(`SMS to ${to} (${purpose}) failed:`, result.error);
  }

  return result;
}

// The "multiple listeners" from the original brief: every number here gets
// notified when a new order comes in. Comma-separated in .env.
function adminPhones() {
  return (process.env.ADMIN_NOTIFY_PHONES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function notifyAdminsNewOrder(order) {
  const phones = adminPhones();
  if (phones.length === 0) return [];

  const message =
    `New order ${order.orderNumber} from ${order.customer.name} (${order.customer.phone}). ` +
    `Total ৳${order.pricing.grandTotal}, due ৳${order.pricing.due}.`;

  return Promise.all(
    phones.map((phone) => sendAndLog({ to: phone, message, purpose: 'admin_new_order', orderId: order._id }))
  );
}

async function notifyCustomerConsignmentBooked(order) {
  const trackingUrl = order.courierTrackingLink;
  const message = trackingUrl
    ? `Your Lytronix order ${order.orderNumber} has been shipped via Steadfast Courier. Track: ${trackingUrl}`
    : `Your Lytronix order ${order.orderNumber} has been shipped via Steadfast Courier. Tracking code: ${order.courier?.trackingCode || 'N/A'}`;

  return sendAndLog({
    to: order.customer.phone,
    message,
    purpose: 'customer_consignment_booked',
    orderId: order._id,
  });
}

async function notifyCustomerDelivered(order) {
  const message = `Your Lytronix order ${order.orderNumber} has been delivered. Thank you for shopping with us!`;
  return sendAndLog({ to: order.customer.phone, message, purpose: 'customer_delivered', orderId: order._id });
}

// Storefront phone-login OTP. When the SMS gateway isn't configured, sendAndLog
// still writes an SmsLog row (status 'failed', reason "not configured") and the
// caller falls back to returning the code in the API response in dev.
async function notifyCustomerOtp(phone, code) {
  // BulkSMSBD's documented OTP template ("Your {Brand} OTP is XXXX") — some
  // masking sender IDs are only approved for messages matching this exact
  // opening phrase, so don't reword it.
  const message = `Your Lytronix OTP is ${code}. Valid for ${
    process.env.OTP_TTL_MINUTES || 5
  } minutes. Do not share this code with anyone.`;
  return sendAndLog({ to: phone, message, purpose: 'customer_otp' });
}

// Marketing broadcast to one or many customers, via BulkSMSBD's one-message-
// to-many-recipients mode. Logs one SmsLog row per recipient (using the
// batch's outcome for that number) so it's auditable the same way single
// sends are — the admin sees exactly who got the message and who didn't.
async function sendMarketingSms(numbers, message) {
  const result = await smsGateway.sendBulkSms(numbers, message);

  logger.info('sms: marketing broadcast', {
    recipients: numbers.length,
    sent: result.sent.length,
    failed: result.failed.length,
  });

  const rows = [
    ...result.sent.map((number) => ({
      to: number,
      message,
      purpose: 'marketing',
      status: 'sent',
      responseCode: result.responseCode,
    })),
    ...result.failed.map(({ number, error }) => ({
      to: number,
      message,
      purpose: 'marketing',
      status: 'failed',
      error,
    })),
  ];

  try {
    if (rows.length) await SmsLog.insertMany(rows);
  } catch (err) {
    logger.error('Failed to write marketing SmsLog rows', { error: err.message });
  }

  return { sent: result.sent.length, failed: result.failed.length, total: numbers.length };
}

// Admin "forgot password" — the new password itself is the SMS body, same
// spirit as the customer OTP: nothing to click, just read it off your phone.
async function notifyAdminPasswordReset(phone, newPassword) {
  const message = `Your Lytronix admin password has been reset. New password: ${newPassword}. Please log in and change it.`;
  return sendAndLog({ to: phone, message, purpose: 'admin_password_reset' });
}

// A one-off message an admin types by hand from the order page, sent
// straight to that order's customer.phone — logged against the order
// (purpose 'admin_manual') so it shows up right there in the order's own
// SMS history alongside the automatic notifications.
async function notifyOrderCustomMessage(order, message) {
  return sendAndLog({ to: order.customer.phone, message, purpose: 'admin_manual', orderId: order._id });
}

module.exports = {
  notifyAdminsNewOrder,
  notifyCustomerConsignmentBooked,
  notifyCustomerDelivered,
  notifyCustomerOtp,
  notifyAdminPasswordReset,
  notifyOrderCustomMessage,
  sendMarketingSms,
};
