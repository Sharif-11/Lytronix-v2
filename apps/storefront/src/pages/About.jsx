import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Banknote, HeartHandshake, ArrowRight } from 'lucide-react';
import { COMPANY_NAME } from '../utils/company';

const VALUES = [
  {
    icon: ShieldCheck,
    title: '১০০% আসল প্রোডাক্ট',
    body: 'আমাদের তালিকাভুক্ত প্রতিটি পাওয়ার ব্যাংক, চার্জার ও ব্যাটারি সংগ্রহ করা হয় আসল হিসেবে — কোনো নকল প্রোডাক্ট নেই।',
  },
  {
    icon: Truck,
    title: 'সারা বাংলাদেশে ডেলিভারি',
    body: 'আমরা বিশ্বস্ত কুরিয়ার পার্টনারের মাধ্যমে সারাদেশে ডেলিভারি করি, প্রতিটি অর্ডারের জন্য ট্র্যাকিং লিংকসহ।',
  },
  {
    icon: Banknote,
    title: 'আপনার পছন্দমতো পেমেন্ট',
    body: 'ক্যাশ অন ডেলিভারি অথবা বিকাশ — যেটি সহজ মনে করেন সেটি বেছে নিন, পাঠানোর আগে আমরা কনফার্ম করি।',
  },
  {
    icon: HeartHandshake,
    title: 'প্রকৃত সহায়তা',
    body: 'অর্ডার বা প্রোডাক্ট নিয়ে কোনো প্রশ্ন থাকলে ফোন, হোয়াটসঅ্যাপ অথবা যোগাযোগ ফর্মে জানান — একজন মানুষই উত্তর দেবে।',
  },
];

export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs uppercase tracking-[0.25em] text-ui-gold font-medium mb-3">আমাদের সম্পর্কে</div>
        <h1 className="font-display text-3xl sm:text-4xl text-ui-brand leading-tight">
          স্মার্ট পাওয়ার, সহজ সমাধান।
        </h1>
        <p className="mt-4 text-ui-muted text-sm sm:text-base leading-relaxed">
          {COMPANY_NAME}-এর যাত্রা শুরু হয়েছিল একটি সহজ ভাবনা থেকে: বাংলাদেশে অনলাইনে পাওয়ার ব্যাংক বা
          চার্জার কেনা মানেই যেন আসল প্রোডাক্ট পাওয়া নিয়ে অনিশ্চয়তা বা ডেলিভারি নিয়ে দুশ্চিন্তা না হয়। আমরা
          বেছে বেছে প্রোডাক্টের তালিকা তৈরি করি, নিজেরাই সম্পূর্ণ ডেলিভারি প্রক্রিয়া পরিচালনা করি, এবং যা
          বিক্রি করি তার দায়িত্ব নিই।
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-14">
        {VALUES.map((v) => (
          <div key={v.title} className="card p-5 flex gap-4">
            <div className="w-11 h-11 rounded-2xl bg-ui-brand/10 text-ui-brand flex items-center justify-center shrink-0">
              <v.icon size={20} />
            </div>
            <div>
              <h3 className="font-display text-lg text-ui-ink">{v.title}</h3>
              <p className="text-sm text-ui-muted mt-1">{v.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-8 text-center bg-gradient-to-b from-ui-brand/[0.06] to-transparent">
        <h2 className="font-display text-xl sm:text-2xl text-ui-ink mb-2">অর্ডারের আগে প্রশ্ন আছে?</h2>
        <p className="text-sm text-ui-muted mb-5 max-w-md mx-auto">
          সঠিক প্রোডাক্ট বেছে নিতে অথবা আগের কোনো অর্ডারের খোঁজ নিতে আমরা সাহায্য করতে পেরে খুশি হব।
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/shop/contact" className="btn-primary">
            যোগাযোগ করুন <ArrowRight size={15} />
          </Link>
          <Link to="/shop" className="btn-secondary">
            ক্যাটালগ দেখুন
          </Link>
        </div>
      </div>
    </div>
  );
}
