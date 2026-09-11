import { useEffect, useState } from 'react';
import { Bot, X, Loader2 } from 'lucide-react';
import { getChatAiSettings, updateChatAiSettings } from '../api/client';
import { emitError } from '../lib/errorBus';

// Admin controls for the chat auto-reply assistant: an on/off switch plus a
// free-text knowledge base for questions the product catalogue's own
// name/price/description can't answer (e.g. "we don't stock that exact
// configuration, but X is the closest substitute"). The catalogue itself
// is pulled live from the database every time — nothing to maintain here
// beyond this supplementary text.
export default function ChatAiSettingsModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(true); // optimistic until loaded
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getChatAiSettings()
      .then((d) => {
        setEnabled(d.enabled);
        setKnowledgeBase(d.knowledgeBase || '');
        setGeminiConfigured(d.geminiConfigured);
      })
      .catch(() => emitError("Couldn't load the AI assistant settings."))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const d = await updateChatAiSettings({ enabled, knowledgeBase });
      setEnabled(d.enabled);
      setKnowledgeBase(d.knowledgeBase || '');
      setDirty(false);
    } catch {
      // Surfaced globally via the ErrorModal.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-floating max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-ui-line shrink-0">
          <span className="w-8 h-8 rounded-lg bg-ui-brand/10 text-ui-brand flex items-center justify-center">
            <Bot size={16} />
          </span>
          <h2 className="font-display text-base text-ui-ink flex-1">Chat AI assistant</h2>
          <button type="button" onClick={onClose} className="text-ui-muted hover:text-ui-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-ui-brand" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {!geminiConfigured && (
              <p className="text-xs text-ui-rust bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
                No free <code>GEMINI_API_KEY</code> is configured in <code>server/.env</code> — turning this on
                won't do anything until one is added.
              </p>
            )}

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-ui-ink">Auto-reply to customers</span>
                <span className="block text-xs text-ui-muted mt-0.5">
                  Text-only questions the catalogue + knowledge base fully answer get a reply automatically.
                  Everything else — images, voice notes, and anything the AI isn't fully confident about — is
                  left for you, untouched.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => {
                  setEnabled((v) => !v);
                  setDirty(true);
                }}
                className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                  enabled ? 'bg-ui-brand' : 'bg-ui-line'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>

            <div>
              <span className="label">Additional knowledge base</span>
              <p className="text-xs text-ui-muted -mt-1 mb-1.5">
                Plain text notes for questions the product catalogue alone can't answer — e.g. a similar
                configuration you don't stock, general policies, or common substitutions. The live product
                catalogue (name, price, stock, description) is already included automatically; you don't need
                to repeat it here.
              </p>
              <textarea
                className="input min-h-[220px] font-mono text-[13px]"
                placeholder={
                  'উদাহরণ:\n- আমরা বর্তমানে 3.2V LiFePO4 সেল স্টকে রাখি না; সবচেয়ে কাছাকাছি বিকল্প হলো আমাদের 3.7V Li-ion সেল।\n- সব প্যাকে ১ বছরের ওয়ারেন্টি থাকে।'
                }
                value={knowledgeBase}
                onChange={(e) => {
                  setKnowledgeBase(e.target.value);
                  setDirty(true);
                }}
                maxLength={20000}
              />
              <p className="text-[11px] text-ui-faint text-right mt-1">{knowledgeBase.length} / 20000</p>
            </div>
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-ui-line flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving || loading} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
