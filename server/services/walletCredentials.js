const WalletSettings = require('../models/WalletSettings');
const { decrypt } = require('../utils/secretBox');

// In-memory copy of the saved gateway credentials, so the (synchronous)
// gateway code can read them without a query. Decrypted values live only here —
// never logged, never sent to a client. Refreshed on every admin change and
// every minute (so other server instances pick a change up too).
let byId = new Map(); // accountId -> { provider, creds, sandbox }
let autoActive = {}; // provider -> accountId

async function refresh() {
  try {
    const doc = await WalletSettings.load();
    const nextById = new Map();
    const nextActive = {};
    doc.accounts.forEach((a) => {
      const creds = decrypt(a.credentialsEnc);
      if (!creds) return;
      nextById.set(String(a._id), { provider: a.provider, creds, sandbox: Boolean(a.sandbox), number: a.number });
      if (a.autoActive) nextActive[a.provider] = String(a._id);
    });
    byId = nextById;
    autoActive = nextActive;
  } catch {
    /* keep the last known values */
  }
}

// The account that currently receives automated payments for a wallet, or null.
function active(provider) {
  const id = autoActive[provider];
  const entry = id && byId.get(id);
  return entry ? { id, ...entry } : null;
}

// A specific saved account (an in-flight payment must finish on the account that
// started it, even if the admin has switched the active one since).
function get(accountId) {
  const entry = byId.get(String(accountId));
  return entry ? { id: String(accountId), ...entry } : null;
}

function startRefreshing() {
  refresh();
  setInterval(refresh, 60 * 1000).unref?.();
}

module.exports = { refresh, active, get, startRefreshing };
