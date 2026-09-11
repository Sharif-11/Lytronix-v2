import Catalogue from '../components/Catalogue';
import usePageTitle from '../lib/usePageTitle';

// Dedicated all-products listing — filters, sort and pagination, no home-page
// chrome. `/shop` links here from "browse catalogue" prompts.
export default function Products() {
  usePageTitle('সকল প্রোডাক্ট');
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <h1 className="font-display text-xl sm:text-2xl text-ui-ink">সকল প্রোডাক্ট</h1>
        <p className="text-sm text-ui-muted mt-1">
          BMS, লিথিয়াম ব্যাটারি সেল ও প্যাক — ফিল্টার করে আপনার প্রয়োজনীয় প্রোডাক্টটি খুঁজে নিন।
        </p>
      </div>
      <Catalogue />
    </div>
  );
}
