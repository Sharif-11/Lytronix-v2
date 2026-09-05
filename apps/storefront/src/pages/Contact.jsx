import { useState } from 'react';
import { Phone, Mail, MapPin, MessageCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { submitContact } from '../api/client';
import { COMPANY_PHONE, COMPANY_EMAIL, COMPANY_ADDRESS, COMPANY_WHATSAPP } from '../utils/company';

export default function Contact() {
  const [form, setForm] = useState({ name: '', contact: '', message: '', company: '' }); // `company` = honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.contact.trim() || !form.message.trim()) {
      setError('আপনার সাথে যোগাযোগের মাধ্যম এবং কী প্রয়োজন তা লিখুন।');
      return;
    }
    setSubmitting(true);
    try {
      await submitContact({
        name: form.name,
        phone: form.contact,
        message: form.message,
        company: form.company,
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'বার্তাটি পাঠানো যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-center max-w-xl mx-auto mb-10">
        <div className="text-xs uppercase tracking-[0.25em] text-ui-gold font-medium mb-3">যোগাযোগ</div>
        <h1 className="font-display text-3xl sm:text-4xl text-ui-brand leading-tight">আমরা সাহায্য করতে প্রস্তুত।</h1>
        <p className="mt-3 text-ui-muted text-sm sm:text-base">
          সরাসরি যোগাযোগ করুন, অথবা নিচে বার্তা পাঠান — সাধারণত এক কার্যদিবসের মধ্যে উত্তর দেওয়া হয়।
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Direct contact */}
        <div className="space-y-3">
          <ContactCard icon={Phone} label="কল করুন" value={COMPANY_PHONE} href={`tel:${COMPANY_PHONE}`} />
          <ContactCard
            icon={MessageCircle}
            label="হোয়াটসঅ্যাপ"
            value="চ্যাট করুন"
            href={`https://wa.me/${COMPANY_WHATSAPP}`}
            external
          />
          <ContactCard icon={Mail} label="ইমেইল" value={COMPANY_EMAIL} href={`mailto:${COMPANY_EMAIL}`} />
          <ContactCard icon={MapPin} label="অ্যাড্রেস" value={COMPANY_ADDRESS} wrap />
        </div>

        {/* Message form */}
        <div className="card p-5 sm:p-6">
          {done ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto text-ui-brand mb-3" />
              <h2 className="font-display text-lg text-ui-ink">বার্তা পাঠানো হয়েছে</h2>
              <p className="text-sm text-ui-muted mt-1">ধন্যবাদ — আমরা শীঘ্রই যোগাযোগ করব।</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-display text-lg text-ui-ink">আমাদের বার্তা পাঠান</h2>
              {error && <p className="text-sm text-ui-rust">{error}</p>}

              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">নাম</span>
                <input
                  className="input font-bangla"
                  dir="auto"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="আপনার নাম"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
                  ফোন অথবা ইমেইল <span className="text-ui-rust">*</span>
                </span>
                <input
                  className="input"
                  required
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="01XXXXXXXXX অথবা you@email.com"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
                  বার্তা <span className="text-ui-rust">*</span>
                </span>
                <textarea
                  className="input font-bangla"
                  dir="auto"
                  rows={4}
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="আমরা কীভাবে সাহায্য করতে পারি?"
                />
              </label>
              {/* Honeypot — hidden from real visitors, bots tend to fill every field */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3 gap-2">
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? 'পাঠানো হচ্ছে…' : 'বার্তা পাঠান'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({ icon: Icon, label, value, href, external, wrap }) {
  const content = (
    <div className={`card p-4 flex gap-3.5 hover:border-ui-brand/40 transition-colors ${wrap ? 'items-start' : 'items-center'}`}>
      <div className="w-10 h-10 rounded-xl bg-ui-brand/10 text-ui-brand flex items-center justify-center shrink-0">
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ui-faint uppercase tracking-wide">{label}</div>
        <div className={`text-sm font-medium text-ui-ink ${wrap ? 'font-bangla' : 'truncate'}`} dir={wrap ? 'auto' : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
      {content}
    </a>
  );
}
