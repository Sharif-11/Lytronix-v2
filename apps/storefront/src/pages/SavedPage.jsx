import SavedProducts from '../components/SavedProducts';
import usePageTitle from '../lib/usePageTitle';

// Public saved-products page — works for guests (localStorage) and for
// signed-in customers (server wishlist). The account tab reuses the same
// component behind auth.
export default function SavedPage() {
  usePageTitle('পছন্দের প্রোডাক্ট');
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SavedProducts />
      </div>
    </div>
  );
}
