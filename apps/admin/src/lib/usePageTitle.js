import { useEffect } from 'react';

// One place that owns the browser tab title for every admin route. Pages
// pass a plain string; a handful with async-loaded data (an order number,
// a product name) can update it once loading finishes by just re-calling
// this with the new value — it's a normal effect keyed on `title`.
const SUFFIX = ' · Lytronix Admin';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title}${SUFFIX}` : 'Lytronix Admin';
  }, [title]);
}
