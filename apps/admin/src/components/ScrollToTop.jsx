import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Every route change starts you back at the top of the page — otherwise
 * navigating from a scrolled-down list (Customers) into a form (New order)
 * drops you halfway down it. Uses the browser's smooth scroll, falling back
 * to an instant jump where that isn't supported.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Skip the hash-link case (in-page anchors) — only reset on a real
    // path change.
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
