// Copy text to the clipboard, working around the fact that
// `navigator.clipboard` is unavailable in non-secure contexts — which is
// exactly how the storefront gets tested on a phone (http://192.168.x.x).
// Falls back to the legacy execCommand path, and finally to selecting the
// source node so the user can copy by hand.
export async function copyText(text, sourceEl) {
  const value = String(text ?? '');

  // 1) Modern API — only in a secure context (https / localhost).
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }

  // 2) Legacy execCommand — works over plain http and on older mobile browsers.
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length); // iOS needs an explicit range
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    /* fall through */
  }

  // 3) Last resort — select the on-screen text so a long-press → Copy works.
  try {
    if (sourceEl && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(sourceEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch {
    /* ignore */
  }
  return false;
}
