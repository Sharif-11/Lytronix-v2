import { useEffect, useState } from 'react';
import { Bot, X, Loader2, CheckCircle2, XCircle, HelpCircle, RefreshCw, Search, Ban } from 'lucide-react';
import { getChatAiSettings, updateChatAiSettings, getChatAiLogs } from '../api/client';
import { emitError } from '../lib/errorBus';

const relTime = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// One attempt's outcome, at a glance: posted (answered), capped (skipped
// before ever calling Gemini — this thread already used its 5/day budget),
// declined (silently left for a human — not an error), or errored
// (Gemini/parse failure).
function OutcomeBadge({ log }) {
  if (log.posted) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ui-brand bg-ui-brand/10 px-1.5 py-0.5 rounded-full">
        <CheckCircle2 size={11} /> Posted
      </span>
    );
  }
  if (log.capped) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
        <Ban size={11} /> Daily cap reached
      </span>
    );
  }
  if (log.error) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ui-rust bg-red-50 px-1.5 py-0.5 rounded-full">
        <XCircle size={11} /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ui-muted bg-ui-bg px-1.5 py-0.5 rounded-full">
      <HelpCircle size={11} /> Declined
    </span>
  );
}

function LogRow({ log }) {
  return (
    <div className="border border-ui-line rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ui-ink">{log.phone}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <OutcomeBadge log={log} />
          <span className="text-[11px] text-ui-faint">{relTime(log.createdAt)}</span>
        </div>
      </div>
      <p className="text-sm text-ui-ink font-bangla" dir="auto">
        <span className="text-ui-faint">প্রশ্ন: </span>
        {log.question}
      </p>
      {log.posted && log.answer && (
        <p className="text-sm text-ui-brand font-bangla" dir="auto">
          <span className="text-ui-faint">উত্তর: </span>
          {log.answer}
        </p>
      )}
      {log.capped && (
        <p className="text-xs text-amber-700">This thread already used its 5 auto-replies for today — left for you.</p>
      )}
      {log.error && <p className="text-xs text-ui-rust break-words">{log.error}</p>}
      {!log.posted && !log.capped && !log.error && (
        <p className="text-xs text-ui-muted">
          Not confident / out of scope{log.confidence ? ` (confidence: ${log.confidence})` : ''} — left for you.
        </p>
      )}
    </div>
  );
}

// Admin controls for the chat auto-reply assistant: an on/off switch plus a
// free-text knowledge base for questions the product catalogue's own
// name/price/description can't answer (e.g. "we don't stock that exact
// configuration, but X is the closest substitute"). The catalogue itself
// is pulled live from the database every time — nothing to maintain here
// beyond this supplementary text.
export default function ChatAiSettingsModal({ onClose }) {
  const [tab, setTab] = useState('settings'); // 'settings' | 'logs'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(true); // optimistic until loaded
  const [dirty, setDirty] = useState(false);

  const [logs, setLogs] = useState(null); // null = not loaded yet
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPhone, setLogPhone] = useState('');

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

  const loadLogs = () => {
    setLogsLoading(true);
    getChatAiLogs({ phone: logPhone || undefined, limit: 50 })
      .then((d) => setLogs(d.logs || []))
      .catch(() => emitError("Couldn't load the AI activity log."))
      .finally(() => setLogsLoading(false));
  };

  useEffect(() => {
    if (tab === 'logs' && logs === null) loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

        <div className="flex border-b border-ui-line shrink-0 px-5 gap-4">
          {[
            { id: 'settings', label: 'Settings' },
            { id: 'logs', label: 'Activity log' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-ui-brand text-ui-brand' : 'border-transparent text-ui-muted hover:text-ui-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'logs' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-5 py-3 border-b border-ui-line flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-faint" />
                <input
                  className="input pl-8 py-1.5 text-sm"
                  placeholder="Filter by phone (01XXXXXXXXX)…"
                  value={logPhone}
                  onChange={(e) => setLogPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                />
              </div>
              <button
                type="button"
                onClick={loadLogs}
                disabled={logsLoading}
                className="w-8 h-8 shrink-0 rounded-lg text-ui-muted hover:text-ui-brand hover:bg-ui-brand/10 flex items-center justify-center"
                aria-label="Refresh"
              >
                <RefreshCw size={15} className={logsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {logsLoading && logs === null ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-ui-brand" />
                </div>
              ) : !logs || logs.length === 0 ? (
                <p className="text-sm text-ui-muted text-center py-10">
                  No AI activity {logPhone ? 'for this number' : 'yet'}.
                </p>
              ) : (
                logs.map((log) => <LogRow key={log._id} log={log} />)
              )}
            </div>
            <p className="px-5 py-2 border-t border-ui-line text-[11px] text-ui-faint shrink-0">
              Every attempt — posted, declined, or errored — never shown to customers, auto-deleted after
              server/.env's AI_CHAT_LOG_RETENTION_DAYS (30 days by default).
            </p>
          </div>
        ) : loading ? (
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

            <label className="flex items-center justify-between gap-3 cursor-pointer border border-ui-line rounded-xl px-3.5 py-3 hover:border-ui-faint/60 transition-colors">
              <span>
                <span className="block text-sm font-medium text-ui-ink">Auto-reply to customers</span>
                <span className="block text-xs text-ui-muted mt-0.5">
                  Text-only questions the catalogue + knowledge base fully answer get a reply automatically —
                  on the storefront chat and Messenger alike. Everything else — images, voice notes, anything
                  the AI isn't fully confident about, and any thread past its 5-replies-per-day limit — is left
                  for you, untouched.
                </span>
              </span>
              <span className="relative shrink-0 w-11 h-6">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setDirty(true);
                  }}
                />
                <span className="block w-11 h-6 rounded-full bg-ui-line peer-checked:bg-ui-brand peer-focus-visible:ring-2 peer-focus-visible:ring-ui-brand/30 transition-colors" />
                <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-[1.375rem]" />
              </span>
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
          {tab === 'settings' && (
            <button type="button" onClick={save} disabled={!dirty || saving || loading} className="btn-primary">
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
