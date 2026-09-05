import { useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, Trash2, Star, X, Loader2 } from 'lucide-react';
import { addAddress, updateAddress, deleteAddress, getPoliceStations } from '../../api/client';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import SearchableSelect from '../../components/SearchableSelect';
import { useConfirm } from '../../context/ConfirmContext';

const empty = { label: 'বাসা', zilla: '', policeStation: '', address: '', isDefault: false };

export default function Addresses() {
  const { customer, patchCustomer, refresh } = useCustomerAuth();
  const confirm = useConfirm();
  const [districts, setDistricts] = useState([]);
  const [editing, setEditing] = useState(null); // addr id or 'new'
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPoliceStations().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const addresses = customer?.addresses || [];
  const thanaOptions = useMemo(() => {
    const d = districts.find((x) => x.name === form.zilla);
    return d ? d.policestations : [];
  }, [districts, form.zilla]);

  const startNew = () => {
    setForm({ ...empty, isDefault: addresses.length === 0 });
    setEditing('new');
    setError('');
  };
  const startEdit = (a) => {
    setForm({
      label: a.label || 'বাসা',
      zilla: a.zilla || '',
      policeStation: a.policeStation || '',
      address: a.address || '',
      isDefault: a.isDefault,
    });
    setEditing(a._id);
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.address.trim() || !form.zilla.trim()) {
      setError('জেলা ও অ্যাড্রেস আবশ্যক।');
      return;
    }
    setBusy(true);
    try {
      const res =
        editing === 'new' ? await addAddress(form) : await updateAddress(editing, form);
      patchCustomer(res.customer);
      refresh();
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.message || 'অ্যাড্রেস সেভ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!(await confirm('এই অ্যাড্রেসটি ডিলিট করবেন?', { danger: true }))) return;
    const res = await deleteAddress(id);
    patchCustomer(res.customer);
    refresh();
  };

  const makeDefault = async (id) => {
    const res = await updateAddress(id, { isDefault: true });
    patchCustomer(res.customer);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ui-ink">সেভ করা অ্যাড্রেস</h2>
        {editing === null && (
          <button onClick={startNew} className="btn-primary py-2">
            <Plus size={15} /> অ্যাড্রেস যোগ করুন
          </button>
        )}
      </div>

      {editing !== null && (
        <form onSubmit={save} className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{editing === 'new' ? 'নতুন অ্যাড্রেস' : 'অ্যাড্রেস এডিট'}</h3>
            <button type="button" onClick={() => setEditing(null)} className="text-ui-muted">
              <X size={18} />
            </button>
          </div>
          {error && <p className="text-sm text-ui-rust">{error}</p>}
          <input
            className="input font-bangla"
            dir="auto"
            placeholder="লেবেল (বাসা, অফিস…)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <SearchableSelect
              placeholder={districts.length ? 'জেলা সিলেক্ট করুন…' : 'লোড হচ্ছে…'}
              loading={!districts.length}
              value={form.zilla}
              onChange={(v) => setForm({ ...form, zilla: v, policeStation: '' })}
              options={districts.map((d) => ({ value: d.name, label: d.name }))}
            />
            <SearchableSelect
              placeholder="থানা সিলেক্ট করুন…"
              disabledHint="প্রথমে জেলা বেছে নিন"
              disabled={!form.zilla}
              value={form.policeStation}
              onChange={(v) => setForm({ ...form, policeStation: v })}
              options={thanaOptions.map((ps) => ({ value: ps.name, label: ps.name }))}
            />
          </div>
          <textarea
            className="input font-bangla"
            dir="auto"
            rows={2}
            placeholder="বাসা, রোড, এলাকা…"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            এটি আমার ডিফল্ট ডেলিভারি অ্যাড্রেস হিসেবে ব্যবহার করুন
          </label>
          <button disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={15} className="animate-spin" /> : 'অ্যাড্রেস সেভ করুন'}
          </button>
        </form>
      )}

      {addresses.length === 0 && editing === null && (
        <div className="card p-8 text-center text-ui-muted text-sm">
          এখনো কোনো অ্যাড্রেস সেভ করা হয়নি। পরের বার দ্রুত চেকআউট করতে একটি যোগ করুন।
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {addresses.map((a) => (
          <div key={a._id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="text-sm">
                <div className="font-medium text-ui-ink flex items-center gap-1.5">
                  <MapPin size={13} /> {a.label}
                  {a.isDefault && <span className="text-[10px] text-ui-brand">ডিফল্ট</span>}
                </div>
                <div className="text-ui-muted mt-1 font-bangla" dir="auto">
                  {a.address}
                  <br />
                  {a.policeStation ? `${a.policeStation}, ` : ''}
                  {a.zilla}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-3 pt-3 border-t border-dashed border-ui-line text-xs">
              <button onClick={() => startEdit(a)} className="text-ui-brand hover:underline">
                এডিট
              </button>
              {!a.isDefault && (
                <button onClick={() => makeDefault(a._id)} className="text-ui-muted hover:underline inline-flex items-center gap-1">
                  <Star size={12} /> ডিফল্ট করুন
                </button>
              )}
              <button onClick={() => remove(a._id)} className="text-ui-rust hover:underline inline-flex items-center gap-1 ml-auto">
                <Trash2 size={12} /> ডিলিট করুন
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
