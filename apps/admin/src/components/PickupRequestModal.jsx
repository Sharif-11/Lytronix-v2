import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, Truck } from 'lucide-react';
import { getPickupInfo, createPickupRequest, getPoliceStations } from '../api/client';
import { formatDate } from '../utils/format';
import SearchableSelect from './SearchableSelect';
import { emitError } from '../lib/errorBus';

// Ask Steadfast to send a rider to collect booked parcels. The pickup address
// itself lives in the Steadfast portal ("Pickup Addresses"); we need its ID plus
// the address text and thana. "Save as default" keeps them for next time.
export default function PickupRequestModal({ onClose }) {
  const [info, setInfo] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [form, setForm] = useState({
    addressId: '',
    districtName: '',
    policeStationId: '',
    policeStationName: '',
    address: '',
    contactNumber: '',
    estimatedQty: '',
    note: '',
    saveDefaults: true,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
    getPickupInfo()
      .then((d) => {
        setInfo(d);
        const p = d.defaults || {};
        setForm((f) => ({
          ...f,
          addressId: p.addressId ? String(p.addressId) : '',
          districtName: p.districtName || '',
          policeStationId: p.policeStationId ? String(p.policeStationId) : '',
          policeStationName: p.policeStationName || '',
          address: p.address || '',
          contactNumber: p.contactNumber || '',
          estimatedQty: d.suggestedQty ? String(d.suggestedQty) : '',
        }));
      })
      .catch(() => setInfo({ defaults: {}, recent: [], suggestedQty: 0 }));
  }, []);

  const districtOptions = useMemo(() => districts.map((d) => ({ value: d.name, label: d.name })), [districts]);
  const thanaOptions = useMemo(() => {
    const d = districts.find((x) => x.name === form.districtName);
    return (d ? d.policestations : []).map((ps) => ({ value: ps.name, label: ps.name }));
  }, [districts, form.districtName]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickThana = (name) => {
    const d = districts.find((x) => x.name === form.districtName);
    const ps = d?.policestations.find((p) => p.name === name);
    setForm((f) => ({ ...f, policeStationName: name, policeStationId: ps ? String(ps.id) : '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.policeStationId) {
      emitError('Choose the district and thana of the pickup address.');
      return;
    }
    setBusy(true);
    try {
      await createPickupRequest({
        addressId: form.addressId,
        policeStationId: form.policeStationId,
        districtName: form.districtName,
        policeStationName: form.policeStationName,
        address: form.address,
        contactNumber: form.contactNumber,
        estimatedQty: form.estimatedQty,
        note: form.note,
        saveDefaults: form.saveDefaults,
      });
      setDone(true);
    } catch {
      /* surfaced globally via the ErrorModal (includes "already pending") */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => !busy && onClose()} />
      <div className="relative bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-floating p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-ui-ink flex items-center gap-2">
            <Truck size={18} className="text-ui-brand" /> Request a pickup
          </h3>
          <button onClick={onClose} className="text-ui-faint hover:text-ui-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 size={36} className="mx-auto text-emerald-600 mb-2" />
            <p className="text-ui-ink font-medium">Pickup requested</p>
            <p className="text-sm text-ui-muted mt-1">Steadfast will send a rider to collect your parcels.</p>
            <button onClick={onClose} className="btn-primary mt-4">
              Done
            </button>
          </div>
        ) : !info ? (
          <div className="py-8 text-center text-sm text-ui-muted">Loading…</div>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            <p className="text-xs text-ui-muted">
              Asking again while a request for the same address is still pending is safe — you won’t get two riders.
            </p>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">
                Steadfast pickup address ID <span className="text-ui-rust">*</span>
              </span>
              <input
                required
                inputMode="numeric"
                className="input font-mono"
                placeholder="From “Pickup Addresses” in the Steadfast portal"
                value={form.addressId}
                onChange={(e) => set('addressId', e.target.value.replace(/\D/g, ''))}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">District *</span>
                <SearchableSelect
                  placeholder={districts.length ? 'Select district…' : 'Loading…'}
                  loading={!districts.length}
                  value={form.districtName}
                  onChange={(v) => setForm((f) => ({ ...f, districtName: v, policeStationName: '', policeStationId: '' }))}
                  options={districtOptions}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">Thana *</span>
                <SearchableSelect
                  placeholder="Select thana…"
                  disabledHint="Pick a district first"
                  disabled={!form.districtName}
                  value={form.policeStationName}
                  onChange={pickThana}
                  options={thanaOptions}
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">
                Pickup address <span className="text-ui-rust">*</span>
              </span>
              <textarea
                required
                maxLength={255}
                className="input min-h-[64px]"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">
                  Contact number <span className="text-ui-rust">*</span>
                </span>
                <input
                  required
                  inputMode="numeric"
                  className="input font-mono"
                  placeholder="01XXXXXXXXX"
                  value={form.contactNumber}
                  onChange={(e) => set('contactNumber', e.target.value.replace(/\D/g, '').slice(0, 11))}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">Approx. parcels</span>
                <input
                  inputMode="numeric"
                  className="input"
                  value={form.estimatedQty}
                  onChange={(e) => set('estimatedQty', e.target.value.replace(/\D/g, ''))}
                />
                {info.suggestedQty > 0 && (
                  <span className="block text-[11px] text-ui-muted mt-0.5">{info.suggestedQty} booked and waiting</span>
                )}
              </label>
            </div>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-ui-muted mb-1">Note for the rider (optional)</span>
              <input className="input" maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </label>

            <label className="flex items-center gap-2 text-sm text-ui-ink">
              <input
                type="checkbox"
                className="accent-ui-brand"
                checked={form.saveDefaults}
                onChange={(e) => set('saveDefaults', e.target.checked)}
              />
              Remember these details for next time
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button disabled={busy} className="btn-primary gap-1.5">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />} Request pickup
              </button>
            </div>

            {info.recent?.length > 0 && (
              <div className="pt-3 mt-1 border-t border-dashed border-ui-line">
                <h4 className="text-xs uppercase tracking-wide text-ui-muted mb-1.5">Recent requests</h4>
                <ul className="space-y-1">
                  {info.recent.map((r) => (
                    <li key={r._id} className="text-xs text-ui-muted">
                      {formatDate(r.createdAt)} · {r.estimatedQty ? `~${r.estimatedQty} parcel(s) · ` : ''}
                      <span className="text-ui-ink">{r.address}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
