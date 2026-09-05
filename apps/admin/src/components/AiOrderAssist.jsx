import { useState } from 'react';
import { Sparkles, Loader2, ImagePlus, X, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { aiExtractOrder } from '../api/client';
import { formatMoney } from '../utils/format';
import { emitError } from '../lib/errorBus';

// Paste customer text or a screenshot (a chat message, a Steadfast label, an
// order form photo) -> the backend asks Claude to pull out the order details
// -> the admin reviews the draft and clicks "Fill the form". Nothing is saved
// automatically.
export default function AiOrderAssist({ onApply }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // { preview, base64, mediaType }
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);

  const readImage = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      emitError('That image is over 5MB — please use a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setImage({
        preview: dataUrl,
        base64: dataUrl.split(',')[1],
        mediaType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      readImage(item.getAsFile());
    }
  };

  const extract = async () => {
    if (!text.trim() && !image) {
      emitError('Paste some text or an image first.');
      return;
    }
    setLoading(true);
    setDraft(null);
    try {
      const { draft: d } = await aiExtractOrder({
        text: text.trim() || undefined,
        imageBase64: image?.base64,
        imageMediaType: image?.mediaType,
      });
      setDraft(d);
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!draft) return;
    onApply(draft);
    setOpen(false);
    setDraft(null);
    setText('');
    setImage(null);
  };

  return (
    <section className="border border-dashed border-ui-brand/40 bg-ui-brand/[0.04] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="w-8 h-8 rounded-lg bg-ui-brand/15 text-ui-brand flex items-center justify-center">
          <Sparkles size={16} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-ui-ink">AI assist — paste text or a screenshot</span>
          <span className="block text-xs text-ui-muted">
            Turn a customer message or a courier label into a prefilled order
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-ui-muted" /> : <ChevronDown size={16} className="text-ui-muted" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <textarea
            className="input min-h-[90px]"
            placeholder="Paste the customer's message here… (Bangla or English). You can also paste a screenshot directly."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
          />

          <div className="flex items-center gap-3">
            {image ? (
              <div className="relative w-16 h-16">
                <img src={image.preview} alt="" className="w-full h-full object-cover rounded-lg border border-ui-line" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-ui-line text-ui-rust flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-ui-line hover:border-ui-brand text-ui-faint flex flex-col items-center justify-center gap-0.5 cursor-pointer">
                <ImagePlus size={16} />
                <span className="text-[9px]">Image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => readImage(e.target.files?.[0])}
                />
              </label>
            )}
            <button
              type="button"
              onClick={extract}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {loading ? 'Reading…' : 'Extract details'}
            </button>
          </div>

          {draft && (
            <div className="rounded-lg border border-ui-line bg-white p-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ui-ink">Extracted draft</span>
                <span
                  className={`text-[11px] uppercase font-medium px-1.5 py-0.5 rounded-full ${
                    draft.confidence === 'high'
                      ? 'bg-ui-brand/10 text-ui-brand'
                      : draft.confidence === 'medium'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-ui-rust'
                  }`}
                >
                  {draft.confidence} confidence
                </span>
              </div>
              <p className="text-ui-muted">
                <b className="text-ui-ink">{draft.customer.name || '(no name)'}</b> · {draft.customer.phone || '(no phone)'}
              </p>
              {(draft.customer.address || draft.customer.zilla) && (
                <p className="text-ui-muted">
                  {[draft.customer.address, draft.customer.thana, draft.customer.zilla].filter(Boolean).join(', ')}
                </p>
              )}
              {draft.customer.zilla && (draft.customer.zillaMatched === false || draft.customer.thanaMatched === false) && (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-xs">
                  Couldn't confidently match the district/thana to our list — please pick them manually below.
                </p>
              )}
              {draft.items.length > 0 && (
                <ul className="text-ui-muted list-disc pl-4">
                  {draft.items.map((it, i) => (
                    <li key={i}>
                      {it.name} × {it.quantity}
                      {it.unitPrice ? ` @ ${formatMoney(it.unitPrice)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {(draft.deliveryCharge > 0 || draft.advancePaid > 0 || draft.codAmount > 0) && (
                <p className="text-ui-muted text-xs">
                  {draft.deliveryCharge > 0 && `Delivery ${formatMoney(draft.deliveryCharge)}  `}
                  {draft.advancePaid > 0 && `Advance ${formatMoney(draft.advancePaid)}  `}
                  {draft.codAmount > 0 && `COD ${formatMoney(draft.codAmount)}`}
                </p>
              )}
              {draft.notes && <p className="text-ui-faint text-xs">Note: {draft.notes}</p>}
              <div className="pt-1">
                <button type="button" onClick={apply} className="btn-primary">
                  Fill the form ↓
                </button>
                <span className="text-xs text-ui-muted ml-2">Review everything before saving.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
