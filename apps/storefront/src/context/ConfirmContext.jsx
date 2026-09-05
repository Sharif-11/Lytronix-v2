import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

const ConfirmContext = createContext(null);

/**
 * Promise-based replacement for window.confirm(). Mounted once near the app
 * root; call `const ok = await confirm('ডিলিট করবেন?')` from any handler.
 * Never uses the OS-native confirm dialog.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, title, danger, confirmLabel, cancelLabel }
  const resolverRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    setState({ message, ...opts });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (value) => {
    setState(null);
    resolverRef.current?.(value);
    resolverRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={() => settle(false)} />
          <div className="relative bg-white rounded-2xl shadow-floating border border-ui-line max-w-sm w-full p-5 sm:p-6" dir="auto">
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${
                state.danger ? 'bg-ui-rust/10 text-ui-rust' : 'bg-ui-brand/10 text-ui-brand'
              }`}
            >
              {state.danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
            </div>
            {state.title && <h3 className="font-display text-lg text-ui-ink mb-1">{state.title}</h3>}
            <p className="text-sm text-ui-muted leading-relaxed font-bangla">{state.message}</p>
            <div className="flex gap-2.5 mt-4">
              <button onClick={() => settle(false)} className="btn-secondary flex-1">
                {state.cancelLabel || 'বাতিল'}
              </button>
              <button
                onClick={() => settle(true)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                  state.danger ? 'bg-ui-rust text-white hover:bg-red-700' : 'bg-ui-brand text-white hover:bg-ui-brandDark'
                }`}
              >
                {state.confirmLabel || (state.danger ? 'রিমুভ' : 'কনফার্ম করুন')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
