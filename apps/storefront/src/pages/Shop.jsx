import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Truck, Banknote, RotateCcw, ArrowRight, Search, HeartHandshake, Zap,
} from 'lucide-react';
import Catalogue from '../components/Catalogue';
import { getCategories } from '../api/client';
import { COMPANY_NAME, COMPANY_TAGLINE_BN } from '../utils/company';

const BADGES = [
  { icon: ShieldCheck, label: '১০০% আসল পণ্য' },
  { icon: Banknote, label: 'ক্যাশ অন ডেলিভারি' },
  { icon: Truck, label: 'দ্রুত ডেলিভারি' },
  { icon: RotateCcw, label: 'সহজ রিটার্ন' },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'নিশ্চিত আসল পণ্য',
    body: 'প্রতিটি পণ্য যাচাই করে তালিকাভুক্ত করা হয় — কোনো নকল নয়।',
  },
  {
    icon: Zap,
    title: 'দ্রুত প্রসেসিং',
    body: 'অর্ডার নিশ্চিত হওয়ার পরপরই প্যাকিং ও ডেলিভারির প্রস্তুতি শুরু হয়।',
  },
  {
    icon: Banknote,
    title: 'নমনীয় পেমেন্ট',
    body: 'ক্যাশ অন ডেলিভারি অথবা বিকাশ — যেটি আপনার জন্য সহজ।',
  },
  {
    icon: HeartHandshake,
    title: 'সরাসরি সহায়তা',
    body: 'ফোন বা হোয়াটসঅ্যাপে সরাসরি আমাদের সাথে কথা বলুন।',
  },
];

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const hasQuery = params.get('q') || params.get('category');
  const [categories, setCategories] = useState([]);
  const [heroQ, setHeroQ] = useState('');

  useEffect(() => {
    getCategories().then((d) => setCategories((d.tree || []).slice(0, 8))).catch(() => setCategories([]));
  }, []);

  const submitHeroSearch = (e) => {
    e.preventDefault();
    if (heroQ.trim()) setParams({ q: heroQ.trim() });
  };

  return (
    <div className="min-h-screen pb-20">
      {!hasQuery && (
        <>
          <section className="relative overflow-hidden bg-gradient-to-br from-ui-dark via-ui-darkAlt to-ui-brandDark text-white">
            <div className="absolute inset-0 bg-dot-grid opacity-40" />
            <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-accent-lime/10 blur-2xl" />
            <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-ui-brand/25 blur-2xl" />
            <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-12 sm:pb-16 text-center">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-accent-lime font-medium mb-4 border border-accent-lime/30 rounded-full px-3 py-1">
                {COMPANY_NAME}-তে স্বাগতম
              </div>
              <h1 className="font-display text-3xl sm:text-5xl leading-tight">
                {COMPANY_TAGLINE_BN}
              </h1>
              <p className="mt-4 text-white/70 max-w-xl mx-auto text-sm sm:text-base">
                পাওয়ার ব্যাংক, চার্জার, ব্যাটারি ও এক্সেসরিজ — অনলাইনে অর্ডার করুন, ক্যাশ অন ডেলিভারি বা
                বিকাশে পেমেন্ট করুন। ফোন নম্বর দিয়ে সাইন ইন করে অর্ডার ট্র্যাক করুন ও পছন্দের পণ্য সংরক্ষণ
                করুন।
              </p>

              <form onSubmit={submitHeroSearch} className="mt-7 max-w-lg mx-auto relative">
                <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ui-muted" />
                <input
                  className="w-full rounded-2xl border-0 pl-11 pr-28 py-3.5 text-sm text-ui-ink placeholder:text-ui-faint shadow-floating outline-none ring-2 ring-transparent focus:ring-accent-lime/60 transition-shadow"
                  placeholder="যে পণ্যটি খুঁজছেন তা লিখুন…"
                  value={heroQ}
                  onChange={(e) => setHeroQ(e.target.value)}
                />
                <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 btn-primary px-4">
                  খুঁজুন
                </button>
              </form>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {BADGES.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-white/80">
                    <b.icon size={15} className="text-accent-lime" /> {b.label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {categories.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg sm:text-xl text-ui-ink">ক্যাটাগরি অনুযায়ী দেখুন</h2>
                <Link to="/shop" className="text-sm text-ui-brand hover:underline inline-flex items-center gap-1">
                  সব দেখুন <ArrowRight size={14} />
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {categories.map((c, i) => (
                  <Link
                    key={c._id}
                    to={`/shop/c/${c.slug}`}
                    className="group shrink-0 w-28 sm:w-32 rounded-2xl border border-ui-line bg-white hover:border-ui-brand hover:shadow-raised hover:-translate-y-1 transition-all p-3 text-center"
                  >
                    <div
                      className={`w-14 h-14 mx-auto rounded-2xl overflow-hidden flex items-center justify-center mb-2 transition-transform group-hover:scale-105 ${
                        CATEGORY_TINTS[i % CATEGORY_TINTS.length]
                      }`}
                    >
                      {c.image ? (
                        <img src={c.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-display text-xl">{c.name[0]}</span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-ui-ink line-clamp-2">{c.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Why shop with us */}
          <section className="bg-ui-surfaceAlt border-y border-ui-line">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
              <h2 className="font-display text-lg sm:text-xl text-ui-ink text-center mb-7">
                কেন {COMPANY_NAME} থেকে কিনবেন
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {FEATURES.map((f) => (
                  <div key={f.title} className="bg-white rounded-2xl border border-ui-line p-4 sm:p-5 text-center hover:shadow-raised transition-shadow">
                    <div className="w-11 h-11 rounded-2xl bg-ui-brand/10 text-ui-brand flex items-center justify-center mx-auto mb-3">
                      <f.icon size={20} />
                    </div>
                    <h3 className="font-display text-sm sm:text-base text-ui-ink">{f.title}</h3>
                    <p className="text-xs sm:text-sm text-ui-muted mt-1 leading-relaxed">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <h2 className="font-display text-lg sm:text-xl text-ui-ink pt-8">সকল পণ্য</h2>
          </div>
        </>
      )}

      <Catalogue />
    </div>
  );
}

// Cycled tint backgrounds for category icons so the strip doesn't read as one
// flat block of green — still restrained, no clashing hues.
const CATEGORY_TINTS = [
  'bg-ui-brand/10 text-ui-brand',
  'bg-ui-gold/10 text-ui-gold',
  'bg-accent-lime/15 text-ui-brandDark',
  'bg-sky-100 text-sky-700',
];
