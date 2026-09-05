import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Every route change starts you back at the top of the page — otherwise
 * moving from a scrolled catalogue into a product or the cart drops you
 * halfway down it. Uses smooth scroll, falling back to an instant jump.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
