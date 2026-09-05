import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import SearchableSelect from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmContext';

const emptyForm = { name: '', email: '', phone: '', password: '', role: '', isActive: true };
const PAGE_SIZE = 20;

export default function UserManagement() {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // The staff list is small enough that the backend just returns it all in
  // one go — this reveals it progressively as the admin scrolls instead of
  // rendering everything (and re-fetching) at once, for the same feel as
  // the backend-paginated lists elsewhere.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  async function refresh() {
    setLoading(true);
    const [userList, roleData] = await Promise.all([api.getUsers(), api.getRoles()]);
    setUsers(userList);
    setRoles(roleData.roles);
    setVisibleCount(PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => Math.min(users.length, c + PAGE_SIZE));
      },
      { rootMargin: '600px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [users.length]);

  const visibleUsers = users.slice(0, visibleCount);

  function startEdit(u) {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, phone: u.phone || '', password: '', role: u.role._id || u.role, isActive: u.isActive });
    setShowForm(true);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        const payload = { name: form.name, phone: form.phone, email: form.email, role: form.role, isActive: form.isActive };
        if (form.password) payload.password = form.password;
        await api.updateUserAccount(editingId, payload);
      } else {
        await api.createUser(form);
      }
      resetForm();
      setShowForm(false);
      refresh();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    }
  }

  async function handleDelete(id) {
    if (!(await confirm('Remove this staff account?', { danger: true, confirmLabel: 'Remove' }))) return;
    await api.deleteUserAccount(id);
    refresh();
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 sm:px-5 py-10 text-sm text-ui-muted">{t('common.loading')}</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand">{t('staff.title')}</h1>
          <p className="text-sm text-ui-muted mt-1">{t('staff.count', { n: users.length })}</p>
        </div>
        <button onClick={startCreate} className="btn-primary">{t('staff.addStaff')}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-medium">{editingId ? t('staff.editAccount') : t('staff.addAccount')}</h2>
          <p className="text-xs text-ui-muted -mt-1">{t('staff.requiredNote')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="input" placeholder={t('staff.phoneRequired')} required
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input" placeholder={t('staff.nameOptional')}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder={t('staff.emailOptional')} type="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <SearchableSelect
              required
              placeholder={t('staff.selectRole')}
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={roles.map((r) => ({ value: r._id, label: r.name }))}
            />
            <input className="input" placeholder={editingId ? t('staff.passwordOptional') : t('staff.password')}
              type="password" required={!editingId}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {editingId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                {t('common.active')}
              </label>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 sm:flex-none">
              {editingId ? t('staff.saveChanges') : t('staff.createAccount')}
            </button>
            <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="btn-secondary flex-1 sm:flex-none">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {users.length === 0 && (
        <p className="py-8 text-center text-ui-muted text-sm">{t('staff.noneYet')}</p>
      )}

      {/* Mobile: cards */}
      <div className="sm:hidden space-y-3">
        {visibleUsers.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{u.name || u.phone}</p>
                <p className="text-sm font-mono text-ui-muted truncate">{u.phone}{u.email ? ` · ${u.email}` : ''}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${u.isActive ? 'border-ui-brand text-ui-brand' : 'border-ui-line text-ui-muted'}`}>
                {u.isActive ? t('common.active') : t('common.disabled')}
              </span>
            </div>
            <p className="text-xs text-ui-muted mt-2">{u.role?.name}</p>
            <div className="flex gap-2 mt-3 pt-3 border-t border-dashed border-ui-line">
              <button className="btn-secondary text-xs flex-1" onClick={() => startEdit(u)}>{t('common.edit')}</button>
              <button className="btn-secondary text-xs text-ui-rust flex-1" onClick={() => handleDelete(u.id)}>{t('common.delete')}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      {users.length > 0 && (
        <div className="hidden sm:block card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ui-muted border-b border-ui-line bg-ui-bg/60">
                <th className="px-4 py-3 font-medium">{t('staff.name')}</th>
                <th className="px-4 py-3 font-medium">{t('staff.phone')}</th>
                <th className="px-4 py-3 font-medium">{t('staff.email')}</th>
                <th className="px-4 py-3 font-medium">{t('staff.role')}</th>
                <th className="px-4 py-3 font-medium">{t('staff.status')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.id} className="border-b border-ui-line/60 last:border-b-0 hover:bg-ui-bg/50">
                  <td className="px-4 py-3">{u.name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-ui-muted">{u.phone}</td>
                  <td className="px-4 py-3 text-ui-muted">{u.email || '—'}</td>
                  <td className="px-4 py-3">{u.role?.name}</td>
                  <td className="px-4 py-3">{u.isActive ? t('common.active') : t('common.disabled')}</td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button className="text-ui-brand hover:underline" onClick={() => startEdit(u)}>{t('common.edit')}</button>
                    <button className="text-ui-rust hover:underline" onClick={() => handleDelete(u.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visibleCount < users.length && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <span className="inline-flex items-center gap-2 text-sm text-ui-muted">
            <Loader2 size={16} className="animate-spin" /> {t('common.loading')}
          </span>
        </div>
      )}
    </div>
  );
}
