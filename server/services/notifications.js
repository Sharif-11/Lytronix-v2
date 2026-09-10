const smsGateway = require('./sms');
const SmsLog = require('../models/SmsLog');
const logger = require('./logger');

// Every SMS body in this module is written in Bangla (merchant requirement).
// Bangla is Unicode SMS: ~70 chars = 1 segment, then ~67 per extra segment,
// and each segment is billed — so these bodies are kept as terse as possible
// (ideally 1 segment). Order numbers, codes, links and passwords stay Latin
// so they remain copy-paste/scannable. (Free-text admin broadcasts / per-order
// messages carry whatever the admin types and are not touched here.)

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

  const due =
    order.pricing.due !== order.pricing.grandTotal ? `, বাকি ৳${order.pricing.due}` : '';
  const message =
    `নতুন অর্ডার ${order.orderNumber}\n` +
    `${order.customer.name} ${order.customer.phone}\n` +
    `৳${order.pricing.grandTotal}${due}`;

  return Promise.all(
    phones.map((phone) => sendAndLog({ to: phone, message, purpose: 'admin_new_order', orderId: order._id }))
  );
}

async function notifyCustomerConsignmentBooked(order) {
  const trackingUrl = order.courierTrackingLink;
  const message = trackingUrl
    ? `Lytronix: ${order.orderNumber} কুরিয়ারে পাঠানো হয়েছে।\n${trackingUrl}`
    : `Lytronix: ${order.orderNumber} কুরিয়ারে পাঠানো হয়েছে। কোড: ${
        order.courier?.trackingCode || 'N/A'
      }`;

  return sendAndLog({
    to: order.customer.phone,
    message,
    purpose: 'customer_consignment_booked',
    orderId: order._id,
  });
}

async function notifyCustomerDelivered(order) {
  const message = `Lytronix: অর্ডার ${order.orderNumber} ডেলিভারি সম্পন্ন। ধন্যবাদ!`;
  return sendAndLog({ to: order.customer.phone, message, purpose: 'customer_delivered', orderId: order._id });
}

// Storefront phone-login OTP. When the SMS gateway isn't configured, sendAndLog
// still writes an SmsLog row (status 'failed', reason "not configured") and the
// caller falls back to returning the code in the API response in dev.
async function notifyCustomerOtp(phone, code) {
  // NOTE: some masking sender IDs on BulkSMSBD are only approved for the
  // English "Your {Brand} OTP is XXXX" template. This Bangla body is per the
  // merchant's "all customer-facing messages in Bangla" instruction — if the
  // OTP stops being delivered, that sender-ID template restriction is the
  // first thing to check.
  const message = `Lytronix OTP ${code}। ${
    process.env.OTP_TTL_MINUTES || 5
  } মিনিট বৈধ, কাউকে জানাবেন না।`;
  return sendAndLog({ to: phone, message, purpose: 'customer_otp' });
}

// A guest checked out and we auto-created their account — text them the
// login password so they can sign in without an OTP next time.
async function notifyCustomerNewAccountPassword(phone, password) {
  const message = `Lytronix লগইন\nফোন: ${phone}\nপাসওয়ার্ড: ${password}`;
  return sendAndLog({ to: phone, message, purpose: 'customer_account_created' });
}

// Customer used "forgot password" — text them the new 6-digit password.
async function notifyCustomerPasswordReset(phone, password) {
  const message = `Lytronix নতুন পাসওয়ার্ড: ${password}`;
  return sendAndLog({ to: phone, message, purpose: 'customer_password_reset' });
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
  const message = `Lytronix Admin নতুন পাসওয়ার্ড: ${newPassword}`;
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
  notifyCustomerNewAccountPassword,
  notifyCustomerPasswordReset,
  notifyAdminPasswordReset,
  notifyOrderCustomMessage,
  sendMarketingSms,
};
