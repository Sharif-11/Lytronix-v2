const crypto = require('crypto');

// Encrypts small secrets (e.g. a payment gateway's API credentials) before they
// are stored in the database, so a leaked DB dump / backup doesn't expose them.
// AES-256-GCM; the key comes from SETTINGS_ENCRYPTION_KEY, else JWT_SECRET.
// Changing that value makes previously saved secrets unreadable — they would
// have to be entered again in the admin panel.
const key = () => {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('Set SETTINGS_ENCRYPTION_KEY (or JWT_SECRET) to store gateway credentials.');
  return crypto.createHash('sha256').update(String(secret)).digest();
};

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

// Returns the object, or null when the value is missing / unreadable.
function decrypt(str) {
  if (!str) return null;
  try {
    const [iv, tag, enc] = String(str).split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
