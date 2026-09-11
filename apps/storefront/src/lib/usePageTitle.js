import { useEffect } from 'react';

// One place that owns the browser tab title for every storefront route.
// Pages pass a plain string; a handful with async-loaded data (a product
// name) can update it once loading finishes by just re-calling this with
// the new value — it's a normal effect keyed on `title`.
const SUFFIX = ' · Lytronix';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title}${SUFFIX}` : 'Lytronix — স্মার্ট পাওয়ার, দীর্ঘস্থায়ী সেবা';
  }, [title]);
}
