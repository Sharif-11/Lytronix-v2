import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderTree, Plus, X, Loader2, ImagePlus, ChevronRight, ChevronDown } from 'lucide-react';
import * as api from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import SearchableSelect from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmContext';
import { emitError } from '../lib/errorBus';
import usePageTitle from '../lib/usePageTitle';

const emptyForm = {
  name: '',
  parent: '',
  description: '',
  image: '',
  isActive: true,
  sortOrder: 0,
};

export default function CategoryManagement() {
  const { t } = useLanguage();
  usePageTitle(t('categories.title'));
  const confirm = useConfirm();
  const [tree, setTree] = useState([]);
  const [flat, setFlat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { cat, productCount, target }
  const fileRef = useRef(null);

  async function refresh() {
    setLoading(true);
    const data = await api.getCategories({ includeInactive: 'true' });
    setTree(data.tree || []);
    setFlat(data.flat || []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Options for the parent <select>, excluding the category being edited and
  // its descendants (can't move a node under itself). The server also guards
  // against cycles, so this only needs to cover the common cases.
  const parentOptions = useMemo(() => {
    if (!editingId) return flat;
    const banned = new Set([String(editingId)]);
    let grew = true;
    while (grew) {
      grew = false;
      flat.forEach((c) => {
        if (c.parent && banned.has(String(c.parent)) && !banned.has(String(c._id))) {
          banned.add(String(c._id));
          grew = true;
        }
      });
    }
    return flat.filter((c) => !banned.has(String(c._id)));
  }, [flat, editingId]);

  function startCreate(parentId = '') {
    setForm({ ...emptyForm, parent: parentId });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(cat) {
    setForm({
      name: cat.name,
      parent: cat.parent || '',
      description: cat.description || '',
      image: cat.image || '',
      isActive: cat.isActive,
      sortOrder: cat.sortOrder || 0,
    });
    setEditingId(cat._id);
    setShowForm(true);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleImage(file) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, image: url }));
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form, parent: form.parent || null, sortOrder: Number(form.sortOrder) || 0 };
    try {
      if (editingId) await api.updateCategory(editingId, payload);
      else await api.createCategory(payload);
      resetForm();
      refresh();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    }
  }

  async function handleDelete(cat) {
    if (!(await confirm(`Delete "${cat.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      // Probe first without the global error modal — a "products still
      // assigned" response isn't a failure to report, it's a prompt to
      // resolve right here via the move-products modal below.
      await api.deleteCategory(cat._id, undefined, { skipErrorModal: true });
      refresh();
    } catch (err) {
      const data = err.response?.data;
      if (data?.productCount) {
        setMoveModal({ cat, productCount: data.productCount, target: 'none' });
      } else {
        emitError(data?.message || 'Could not delete this category.');
      }
    }
  }

  async function confirmMoveAndDelete() {
    if (!moveModal) return;
    try {
      await api.deleteCategory(moveModal.cat._id, moveModal.target);
      setMoveModal(null);
      refresh();
    } catch {
      // Surfaced globally via the ErrorModal (see api/client.js interceptor).
    }
  }

  async function nudge(cat, delta) {
    try {
      await api.updateCategory(cat._id, { sortOrder: (cat.sortOrder || 0) + delta });
      refresh();
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-ui-muted">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ui-brand flex items-center gap-2">
            <FolderTree size={24} /> {t('categories.title')}
          </h1>
          <p className="text-sm text-ui-muted mt-1">{t('categories.count', { n: flat.length })}</p>
        </div>
        <button onClick={() => startCreate('')} className="btn-primary">
          <Plus size={16} /> {t('categories.addCategory')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editingId ? t('categories.editCategory') : t('categories.newCategory')}</h2>
            <button type="button" onClick={resetForm} className="text-ui-muted">
              <X size={18} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">{t('categories.name')}</span>
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">{t('categories.parent')}</span>
              <SearchableSelect
                placeholder={t('categories.noneTopLevel')}
                value={form.parent}
                onChange={(v) => setForm({ ...form, parent: v })}
                options={parentOptions.map((c) => ({ value: c._id, label: `${c.parent ? '— ' : ''}${c.name}` }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">{t('categories.description')}</span>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-4">
            <div>
              <span className="label">{t('categories.image')}</span>
              {form.image ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-ui-line">
                  <img src={form.image} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      api.deleteCloudinaryAsset(form.image).catch(() => {});
                      setForm({ ...form, image: '' });
                    }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-ui-rust flex items-center justify-center"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-ui-line hover:border-ui-brand text-ui-faint flex flex-col items-center justify-center gap-1"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  <span className="text-[10px]">{t('categories.addImage')}</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImage(e.target.files?.[0])}
              />
            </div>
            <label className="block w-24">
              <span className="label">{t('categories.sortOrder')}</span>
              <input
                type="number"
                className="input"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('common.active')}
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary">
              {editingId ? t('common.save') : t('categories.newCategory')}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="card divide-y divide-ui-line">
        {tree.length === 0 && (
          <p className="p-8 text-center text-ui-muted text-sm">{t('categories.noCategories')}</p>
        )}
        {tree.map((node) => (
          <CategoryRow
            key={node._id}
            node={node}
            depth={0}
            onEdit={startEdit}
            onDelete={handleDelete}
            onAddChild={(id) => startCreate(id)}
            onNudge={nudge}
            t={t}
          />
        ))}
      </div>

      {moveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={() => setMoveModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-floating border border-ui-line max-w-sm w-full p-5 sm:p-6">
            <h3 className="font-display text-lg text-ui-ink mb-1">Move products first</h3>
            <p className="text-sm text-ui-muted leading-relaxed mb-4">
              {moveModal.productCount} product{moveModal.productCount === 1 ? '' : 's'} still {moveModal.productCount === 1 ? 'is' : 'are'} in
              &nbsp;"{moveModal.cat.name}". Choose where to move {moveModal.productCount === 1 ? 'it' : 'them'} before deleting the category.
            </p>
            <SearchableSelect
              label="Move products to"
              value={moveModal.target}
              onChange={(v) => setMoveModal((m) => ({ ...m, target: v }))}
              clearable={false}
              options={[
                { value: 'none', label: 'Leave uncategorised' },
                ...flat.filter((c) => c._id !== moveModal.cat._id).map((c) => ({ value: c._id, label: c.name })),
              ]}
            />
            <div className="flex gap-2.5 mt-4">
              <button onClick={() => setMoveModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmMoveAndDelete} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ui-rust px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-red-700 active:scale-[0.98] transition-all">
                Move &amp; delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ node, depth, onEdit, onDelete, onAddChild, onNudge, t }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-ui-bg/50"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen((o) => !o)} className="text-ui-faint shrink-0">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span className="w-[15px] shrink-0" />
        )}

        {node.image ? (
          <img src={node.image} alt="" className="w-8 h-8 rounded-lg object-cover border border-ui-line shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-lg bg-ui-surfaceAlt border border-ui-line shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ui-ink flex items-center gap-2">
            {node.name}
            {!node.isActive && (
              <span className="text-[10px] uppercase text-ui-muted border border-ui-line rounded-full px-1.5">
                {t('categories.hidden')}
              </span>
            )}
          </div>
          <div className="text-xs text-ui-faint">
            /{node.slug}
            {node.productCount ? ` · ${t('products.count', { n: node.productCount })}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 text-xs">
          <button onClick={() => onNudge(node, -1)} title="Move up" className="p-1 text-ui-faint hover:text-ui-ink">
            ▲
          </button>
          <button onClick={() => onNudge(node, 1)} title="Move down" className="p-1 text-ui-faint hover:text-ui-ink">
            ▼
          </button>
          <button onClick={() => onAddChild(node._id)} className="text-ui-brand hover:underline px-1">
            {t('categories.addSub')}
          </button>
          <button onClick={() => onEdit(node)} className="text-ui-brand hover:underline px-1">
            {t('common.edit')}
          </button>
          <button onClick={() => onDelete(node)} className="text-ui-rust hover:underline px-1">
            {t('common.delete')}
          </button>
        </div>
      </div>
      {hasChildren &&
        open &&
        node.children.map((child) => (
          <CategoryRow
            key={child._id}
            node={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
            onNudge={onNudge}
            t={t}
          />
        ))}
    </>
  );
}
