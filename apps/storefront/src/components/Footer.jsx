import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, MessageCircle, ShieldCheck, Truck, Banknote, Navigation } from 'lucide-react';
import {
  COMPANY_NAME, COMPANY_PHONE, COMPANY_EMAIL, COMPANY_ADDRESS, COMPANY_WHATSAPP,
  COMPANY_MAPS_URL, COMPANY_MAPS_EMBED_URL,
} from '../utils/company';
import logo from '../assets/lytronix-logo.png';

export default function Footer() {
  return (
    <footer className="border-t border-ui-line bg-white mt-16">
      {/* Trust strip */}
      <div className="bg-ui-brand/[0.04] border-b border-ui-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap justify-center sm:justify-between gap-x-8 gap-y-2 text-xs sm:text-sm text-ui-ink">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={15} className="text-ui-brand" /> ১০০% আসল প্রোডাক্টের নিশ্চয়তা
          </span>
          <span className="inline-flex items-center gap-2">
            <Truck size={15} className="text-ui-brand" /> সারা বাংলাদেশে হোম ডেলিভারি
          </span>
          <span className="inline-flex items-center gap-2">
            <Banknote size={15} className="text-ui-brand" /> ক্যাশ অন ডেলিভারি সুবিধা
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <img src={logo} alt={COMPANY_NAME} className="h-8 w-auto mb-3" />
            <p className="text-sm text-ui-muted leading-relaxed max-w-xs">
              আইপিএস ও ইউপিএস-এর জন্য BMS এবং লিথিয়াম ব্যাটারি সেল ও প্যাক — আসল প্রোডাক্ট, ক্যাশ অন
              ডেলিভারিসহ সারা বাংলাদেশে ডেলিভারি।
            </p>
          </div>

          <FooterColumn title="শপিং">
            <FooterLink to="/shop/products">সকল প্রোডাক্ট</FooterLink>
            <FooterLink to="/shop/saved">পছন্দের প্রোডাক্ট</FooterLink>
            <FooterLink to="/shop/cart">কার্ট</FooterLink>
            <FooterLink to="/shop/login">লগইন</FooterLink>
          </FooterColumn>

          <FooterColumn title="কোম্পানি">
            <FooterLink to="/shop/about">আমাদের সম্পর্কে</FooterLink>
            <FooterLink to="/shop/contact">যোগাযোগ</FooterLink>
          </FooterColumn>

          <FooterColumn title="যোগাযোগ করুন">
            <a href={`tel:${COMPANY_PHONE}`} className="flex items-center gap-2 text-sm text-ui-muted hover:text-ui-brand">
              <Phone size={14} /> {COMPANY_PHONE}
            </a>
            <a
              href={`https://wa.me/${COMPANY_WHATSAPP}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-ui-muted hover:text-ui-brand"
            >
              <MessageCircle size={14} /> হোয়াটসঅ্যাপ
            </a>
            <a href={`mailto:${COMPANY_EMAIL}`} className="flex items-center gap-2 text-sm text-ui-muted hover:text-ui-brand">
              <Mail size={14} /> {COMPANY_EMAIL}
            </a>
            <span className="flex items-start gap-2 text-sm text-ui-muted font-bangla" dir="auto">
              <MapPin size={14} className="shrink-0 mt-0.5" /> {COMPANY_ADDRESS}
            </span>
            <a
              href={COMPANY_MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-ui-brand hover:underline"
            >
              <Navigation size={14} /> Google Maps-এ ডিরেকশন
            </a>
          </FooterColumn>
        </div>

        {/* Embedded location map */}
        <div className="mt-10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ui-faint mb-3">আমাদের অবস্থান</h3>
          <div className="rounded-2xl overflow-hidden border border-ui-line">
            <iframe
              title={`${COMPANY_NAME} — Google Maps`}
              src={COMPANY_MAPS_EMBED_URL}
              className="w-full h-56 sm:h-72"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-10 pt-6 border-t border-ui-line">
          <p className="text-xs text-ui-faint">© {new Date().getFullYear()} {COMPANY_NAME}। সর্বস্বত্ব সংরক্ষিত।</p>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded border border-ui-line px-2 py-0.5 text-ui-faint">ক্যাশ অন ডেলিভারি</span>
            <span className="rounded px-2 py-0.5 font-semibold text-white" style={{ background: '#E2136E' }}>
              bKash
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ui-faint mb-3">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FooterLink({ to, children }) {
  return (
    <Link to={to} className="text-sm text-ui-muted hover:text-ui-brand">
      {children}
    </Link>
  );
}
