import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Plus, X } from 'lucide-react';
import * as api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';
import usePageTitle from '../lib/usePageTitle';

const emptyForm = { name: '', description: '', permissions: [] };

export default function RoleManagement() {
  const { t } = useLanguage();
  usePageTitle(t('roles.title'));
  const confirm = useConfirm();
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // role object being edited
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    const data = await api.getRoles();
    setRoles(data.roles);
    setGroups(data.permissionGroups || []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function startEdit(r) {
    setEditing(r);
    setForm({ name: r.name, description: r.description || '', permissions: [...r.permissions] });
    setShowForm(true);
  }
  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }
  function reset() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  function togglePermission(code) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(code)
        ? f.permissions.filter((x) => x !== code)
        : [...f.permissions, code],
    }));
  }

  function toggleGroup(group) {
    const codes = group.permissions.map((p) => p.code);
    const allOn = codes.every((c) => form.permissions.includes(c));
    setForm((f) => ({
      ...f,
      permissions: allOn
        ? f.permissions.filter((c) => !codes.includes(c))
        : [...new Set([...f.permissions, ...codes])],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing) {
        const payload = { description: form.description, permissions: form.permissions };
        if (!editing.isSystem) payload.name = form.name;
        await api.updateRole(editing._id, payload);
      } else {
        await api.createRole(form);
      }
      reset();
      refresh();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    }
  }

  async function handleDelete(id) {
    if (!(await confirm('Delete this role?', { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.deleteRole(id);
      refresh();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    }
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-ui-muted">{t('common.loading')}</div>;
  }

  const editingLocked = editing?.isSuperAdmin;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand flex items-center gap-2">
            <ShieldCheck size={24} /> {t('roles.title')}
          </h1>
          <p className="text-sm text-ui-muted mt-1">{t('roles.count', { n: roles.length })}</p>
        </div>
        <button onClick={startCreate} className="btn-primary">
          <Plus size={16} /> {t('roles.addRole')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {editing ? t('roles.editRole', { name: editing.name }) : t('roles.addRoleTitle')}
              {editing?.isSystem && !editing?.isSuperAdmin && (
                <span className="text-xs text-ui-muted ml-2">{t('roles.builtIn')}</span>
              )}
            </h2>
            <button type="button" onClick={reset} className="text-ui-muted">
              <X size={18} />
            </button>
          </div>

          {editingLocked ? (
            <div className="flex items-center gap-2 text-sm text-ui-muted bg-ui-bg rounded-lg px-3 py-2">
              <Lock size={14} /> {t('roles.superadminLocked')}
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder={t('roles.roleName')}
                required
                disabled={editing?.isSystem}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="input"
                placeholder={t('roles.description')}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              <div className="space-y-4">
                {groups.map((group) => {
                  const codes = group.permissions.map((p) => p.code);
                  const allOn = codes.every((c) => form.permissions.includes(c));
                  const someOn = codes.some((c) => form.permissions.includes(c));
                  return (
                    <div key={group.key} className="border border-ui-line rounded-xl p-3">
                      <label className="flex items-center gap-2 text-sm font-medium mb-2">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => el && (el.indeterminate = !allOn && someOn)}
                          onChange={() => toggleGroup(group)}
                        />
                        {group.label}
                      </label>
                      <div className="grid sm:grid-cols-2 gap-1.5 pl-1">
                        {group.permissions.map((p) => (
                          <label
                            key={p.code}
                            className="flex items-start gap-2 text-sm bg-ui-bg/60 rounded-lg px-2.5 py-1.5"
                            title={p.description}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={form.permissions.includes(p.code)}
                              onChange={() => togglePermission(p.code)}
                            />
                            <span>
                              <span className="block leading-tight">{p.label}</span>
                              <span className="block text-[11px] text-ui-faint leading-tight">
                                {p.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn-primary">
                  {editing ? t('common.save') : t('roles.createRole')}
                </button>
                <button type="button" onClick={reset} className="btn-secondary">
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      <div className="space-y-3">
        {roles.map((r) => (
          <div key={r._id} className="card p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-2">
                  {r.name}
                  {r.isSuperAdmin && <span className="text-xs text-ui-gold">{t('roles.fullAccess')}</span>}
                  {r.isSystem && !r.isSuperAdmin && (
                    <span className="text-[10px] uppercase text-ui-muted border border-ui-line rounded-full px-1.5">
                      {t('roles.systemBadge')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-ui-muted">{r.description}</p>
                <p className="text-xs mt-1 text-ui-faint">
                  {r.isSuperAdmin
                    ? t('roles.allPermissions')
                    : r.permissions.join(', ') || t('roles.noPermissions')}
                </p>
                <p className="text-xs text-ui-faint mt-0.5">{t('roles.userCount', { n: r.userCount })}</p>
              </div>
              <div className="flex gap-2 shrink-0 text-xs">
                {!r.isSuperAdmin && (
                  <button className="text-ui-brand hover:underline" onClick={() => startEdit(r)}>
                    {t('common.edit')}
                  </button>
                )}
                {!r.isSystem && (
                  <button className="text-ui-rust hover:underline" onClick={() => handleDelete(r._id)}>
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
