// The storefront lives on its own host, so the admin can't derive its URL
// from window.location. Set VITE_STOREFRONT_URL for production builds; in dev
// it falls back to the local storefront dev server.
const STOREFRONT_URL = (import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173').replace(/\/$/, '');

// Public, shareable single-product landing page (order + checkout on the page).
export function productLandingUrl(slug) {
  return `${STOREFRONT_URL}/p/${slug}`;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
