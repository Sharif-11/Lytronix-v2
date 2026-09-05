import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  MessageCircle, Phone, Instagram, Facebook, PhoneCall, MessageSquareText,
  MoreHorizontal, X, Plus,
} from 'lucide-react';
import {
  getCustomer, createCustomer, updateCustomer, getPoliceStations,
  getOtpStatus, resetOtpLimit,
} from '../api/client';
import RichTextEditor from '../components/RichTextEditor';
import SearchableSelect from '../components/SearchableSelect';
import { usePhoneticField } from '../lib/phonetic';
import { usePhonetic } from '../context/PhoneticContext';
import { emitError } from '../lib/errorBus';
import { useConfirm } from '../context/ConfirmContext';
import { KeyRound, RotateCcw, Loader2 } from 'lucide-react';

const empty = { name: '', phone: '', zilla: '', thana: '', address: '', comments: '', channels: [], priority: 'medium', tags: [] };

const CHANNEL_OPTIONS = [
  { value: 'messenger', label: 'Messenger', icon: MessageCircle },
  { value: 'whatsapp', label: 'WhatsApp', icon: Phone },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'phone', label: 'Phone call', icon: PhoneCall },
  { value: 'sms', label: 'SMS', icon: MessageSquareText },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const PRESET_TAGS = ['Future customer', 'Paikari (wholesale)', 'Khuchra (retail)', 'VIP', 'Regular'];

export default function CustomerForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const { phoneticOn } = usePhonetic(); // universal — set once from the navbar, applies here too
  const [tagInput, setTagInput] = useState('');
  const [districts, setDistricts] = useState([]);

  const nameRef = useRef(null);
  const addressRef = useRef(null);

  useEffect(() => {
    if (!isEdit) return;
    getCustomer(id).then((data) => setForm({ ...empty, ...data })).finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => {
    // Cached on the backend (with a bundled fallback dataset), so this is
    // cheap — the upstream Packzy API is only ever hit on a cache miss.
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const thanaOptions = useMemo(() => {
    const d = districts.find((d) => d.name === form.zilla);
    return d ? d.policestations : [];
  }, [districts, form.zilla]);

  const namePhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: form.name,
    onChangeValue: (v) => setForm((f) => ({ ...f, name: v })),
  });
  const addressPhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: form.address,
    onChangeValue: (v) => setForm((f) => ({ ...f, address: v })),
  });
  const tagPhonetic = usePhoneticField({
    enabled: phoneticOn,
    value: tagInput,
    onChangeValue: setTagInput,
  });

  const toggleChannel = (value) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(value) ? f.channels.filter((c) => c !== value) : [...f.channels, value],
    }));
  };

  const addTag = (raw) => {
    const t = raw.trim();
    if (!t || form.tags.includes(t)) return;
    setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };
  const removeTag = (t) => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) {
      emitError('Phone number is required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) await updateCustomer(id, form);
      else await createCustomer(form);
      navigate('/customers');
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="max-w-2xl mx-auto px-4 sm:px-5 py-10 text-ui-muted">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand">{isEdit ? 'Edit customer' : 'New customer'}</h1>
        <Link to="/customers" className="text-sm text-ui-muted hover:text-ui-brand underline underline-offset-4">Back to notebook</Link>
      </div>

      <p className="mb-5 sm:mb-6 text-xs text-ui-muted">
        Type Bangla phonetically in Name, Address, or Comments — e.g. type "ami" for আমি. Toggle phonetic typing or the
        on-screen Bangla keyboard from the navbar above.
      </p>

      <form onSubmit={handleSubmit} className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-5 space-y-4">
        <Field label="Phone number" required>
          <input
            type="tel"
            className="input"
            placeholder="e.g. 01XXXXXXXXX"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Name (optional)">
          <input
            ref={nameRef}
            className="input font-bangla"
            dir="auto"
            lang="bn"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={namePhonetic.onKeyDown}
            onClick={namePhonetic.onClick}
            onBlur={namePhonetic.onBlur}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Zilla / District (optional)">
            <SearchableSelect
              placeholder={districts.length ? 'Select district…' : 'Loading districts…'}
              loading={!districts.length}
              value={form.zilla}
              onChange={(v) => setForm({ ...form, zilla: v, thana: '' })}
              options={districts.map((d) => ({ value: d.name, label: d.name }))}
            />
          </Field>
          <Field label="Thana / Upazilla (optional)">
            <SearchableSelect
              placeholder="Select thana…"
              disabledHint="Pick a district first"
              disabled={!form.zilla}
              value={form.thana}
              onChange={(v) => setForm({ ...form, thana: v })}
              options={thanaOptions.map((t) => ({ value: t.name, label: t.name }))}
            />
          </Field>
        </div>

        <Field label="Address (optional)">
          <textarea
            ref={addressRef}
            rows={2}
            className="input font-bangla"
            dir="auto"
            lang="bn"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            onKeyDown={addressPhonetic.onKeyDown}
            onClick={addressPhonetic.onClick}
            onBlur={addressPhonetic.onBlur}
          />
        </Field>

        <Field label="Reaches customer via (optional)">
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = form.channels.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleChannel(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-ui-brand bg-ui-brand text-white'
                      : 'border-ui-line bg-white text-ui-ink hover:bg-ui-line/40'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Priority">
          <div className="inline-flex rounded-lg border border-ui-line overflow-hidden">
            {PRIORITY_OPTIONS.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, priority: value })}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-ui-line' : ''} ${
                  form.priority === value
                    ? value === 'high'
                      ? 'bg-ui-rust text-white'
                      : value === 'low'
                      ? 'bg-ui-muted text-white'
                      : 'bg-ui-gold text-white'
                    : 'bg-white text-ui-ink hover:bg-ui-line/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Customer type / tags (optional)">
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESET_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                disabled={form.tags.includes(t)}
                className="rounded-full border border-dashed border-ui-line px-3 py-1 text-xs text-ui-muted hover:border-ui-brand hover:text-ui-brand disabled:opacity-30 disabled:hover:border-ui-line disabled:hover:text-ui-muted transition-colors"
              >
                + {t}
              </button>
            ))}
          </div>

          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-ui-brand/10 text-ui-brand px-3 py-1 text-xs font-medium font-bangla"
                  dir="auto"
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              className="input font-bangla flex-1"
              dir="auto"
              placeholder="Add a custom tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); return; }
                tagPhonetic.onKeyDown(e);
              }}
              onClick={tagPhonetic.onClick}
              onBlur={tagPhonetic.onBlur}
            />
            <button type="button" onClick={() => addTag(tagInput)} className="btn-secondary px-3">
              <Plus size={15} />
            </button>
          </div>
        </Field>

        <Field label="Comments (optional)">
          <RichTextEditor
            value={form.comments}
            onChange={(html) => setForm({ ...form, comments: html })}
            placeholder="Anything worth remembering — preferences, past issues, notes for next time…"
            phoneticEnabled={phoneticOn}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Link to="/customers" className="btn-secondary">Cancel</Link>
          <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save customer'}</button>
        </div>
      </form>

      {isEdit && /^01\d{9}$/.test((form.phone || '').replace(/\D/g, '')) && (
        <OtpLimitCard phone={form.phone.replace(/\D/g, '')} />
      )}
    </div>
  );
}

function OtpLimitCard({ phone }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = () => {
    setLoading(true);
    getOtpStatus(phone)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = async () => {
    if (!(await confirm(`Reset the login-OTP limit for ${phone}? They'll be able to request codes again immediately.`, { confirmLabel: 'Reset' }))) return;
    setResetting(true);
    try {
      await resetOtpLimit(phone);
      load();
    } catch {
      // Surfaced globally via the ErrorModal.
    } finally {
      setResetting(false);
    }
  };

  const blockedFor = status?.blockedUntil
    ? Math.max(1, Math.ceil((new Date(status.blockedUntil).getTime() - Date.now()) / 3600000))
    : 0;

  return (
    <div className="mt-4 bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
      <h2 className="font-display text-base text-ui-ink flex items-center gap-2 mb-1">
        <KeyRound size={16} className="text-ui-brand" /> Login OTP limit
      </h2>
      <p className="text-xs text-ui-muted mb-3">
        SMS costs money, so login codes to this number are capped. Reset here if the customer is genuinely locked out.
      </p>

      {loading ? (
        <p className="text-sm text-ui-muted inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking…</p>
      ) : !status ? (
        <p className="text-sm text-ui-muted">Couldn't load OTP status.</p>
      ) : !status.exists ? (
        <p className="text-sm text-ui-muted">No OTP activity for this number yet.</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ui-muted">Requested today</span>
            <span className={`font-mono ${status.sentToday >= status.maxPerDay ? 'text-ui-rust font-semibold' : 'text-ui-ink'}`}>
              {status.sentToday} / {status.maxPerDay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ui-muted">Lifetime</span>
            <span className={`font-mono ${status.lifetimeExhausted ? 'text-ui-rust font-semibold' : 'text-ui-ink'}`}>
              {status.lifetimeCount} / {status.maxLifetime}
            </span>
          </div>
          {blockedFor > 0 && (
            <p className="text-xs text-ui-rust">Throttled — no new codes for ~{blockedFor}h.</p>
          )}
          {status.lifetimeExhausted && (
            <p className="text-xs text-ui-rust">Lifetime limit reached — only a reset frees this number.</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleReset}
        disabled={resetting || loading}
        className="btn-secondary text-sm gap-1.5 mt-3"
      >
        {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
        Reset OTP limit
      </button>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-ui-muted mb-1">
        {label} {required && <span className="text-ui-rust">*</span>}
      </span>
      {children}
    </label>
  );
}
