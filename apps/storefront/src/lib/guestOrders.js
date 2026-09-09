// Device-scoped memory for guest shoppers — lives only in this browser's
// localStorage. On a guest checkout we remember just the phone number (plus
// name + last address, to prefill the next order). The "My orders" page then
// looks that phone up on the server (POST /api/track/by-phone).
//
//   { phone, name, address:{name,phone,zilla,thana,address}|null }
//
// A signed-in customer's real account history always supersedes this.

const KEY = 'lytronix:guest';
const EVENT = 'lytronix:guest-session';

const blank = () => ({ phone: '', name: '', address: null });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const v = JSON.parse(raw) || {};
    return { phone: v.phone || '', name: v.name || '', address: v.address || null };
  } catch {
    return blank();
  }
}

function write(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* private mode / storage disabled — feature just stays off */
  }
}

// Call right after a successful guest `createOrder` with the returned order.
export function recordGuestCheckout(order) {
  const c = (order && order.customer) || {};
  const phone = (c.phone || '').replace(/\D/g, '');
  if (!/^01\d{9}$/.test(phone)) return;
  const store = read();
  const hasAddr = Boolean(c.address || c.zilla);
  write({
    phone,
    name: c.name || store.name || '',
    address: hasAddr
      ? { name: c.name || '', phone, zilla: c.zilla || '', thana: c.thana || '', address: c.address || '' }
      : store.address,
  });
}

export const GUEST_SESSION_EVENT = EVENT;
export const getGuestPhone = () => read().phone;
export const hasGuestSession = () => Boolean(read().phone);

// A delivery-form prefill for a returning guest (name / phone / last address).
export function getReorderPrefill() {
  const { name, phone, address } = read();
  return {
    name: address?.name || name || '',
    phone: address?.phone || phone || '',
    zilla: address?.zilla || '',
    thana: address?.thana || '',
    address: address?.address || '',
    comments: '',
  };
}

export function clearGuestSession() {
  write(blank());
}
