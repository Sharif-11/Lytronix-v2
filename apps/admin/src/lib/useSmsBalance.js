import { useEffect, useState } from 'react';
import { getSmsBalance } from '../api/client';

/**
 * Shared SMS-credit check. Used anywhere the admin can send an SMS so the
 * send action can be blocked when there's no usable credit.
 *
 *   error       — the balance couldn't be fetched (gateway/API down)
 *   depleted    — balance fetched, and it's 0 or less
 *   canSend     — safe to attempt a send (true while still loading, too)
 *   unavailable — error || depleted, i.e. show the red "unavailable" chip
 */
export default function useSmsBalance() {
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mocked, setMocked] = useState(false);

  useEffect(() => {
    let alive = true;
    getSmsBalance()
      .then((d) => {
        if (!alive) return;
        setBalance(typeof d.balance === 'number' ? d.balance : null);
        setError(typeof d.balance !== 'number');
        setMocked(Boolean(d.mocked));
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const depleted = !error && balance !== null && balance <= 0;
  const canSend = loading || (!error && !depleted);

  // `mocked` — SMS is simulated (dev mode): the balance is a stand-in and
  // nothing is actually sent. The UI badges this.
  return { balance, loading, error, depleted, canSend, mocked, unavailable: error || depleted };
}
