import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import Catalogue from '../components/Catalogue';
import { getCategory } from '../api/client';
import { track } from '../lib/analytics';
import usePageTitle from '../lib/usePageTitle';

export default function Category() {
  const { slug } = useParams();
  const [meta, setMeta] = useState(null);
  usePageTitle(meta?.category?.name || 'ক্যাটাগরি');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setMeta(null);
    setNotFound(false);
    getCategory(slug)
      .then((d) => {
        setMeta(d);
        track('category_view', { categoryId: d.category?._id });
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center text-ui-muted">
        এই ক্যাটাগরিটি খুঁজে পাওয়া যায়নি।{' '}
        <Link to="/shop" className="text-ui-brand underline">
          শপে ফিরে যান
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <nav className="flex items-center gap-1.5 text-xs text-ui-muted flex-wrap">
          <Link to="/shop" className="hover:text-ui-brand inline-flex items-center gap-1">
            <Home size={12} /> শপ
          </Link>
          {(meta?.breadcrumb || []).map((c) => (
            <span key={c._id} className="inline-flex items-center gap-1.5">
              <ChevronRight size={12} />
              <Link to={`/shop/c/${c.slug}`} className="hover:text-ui-brand">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>
        <h1 className="font-display text-2xl sm:text-3xl text-ui-brand mt-3">
          {meta?.category?.name || '…'}
        </h1>
        {meta?.category?.description && (
          <p className="text-sm text-ui-muted mt-1 max-w-2xl font-bangla" dir="auto">{meta.category.description}</p>
        )}

        {meta?.children?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {meta.children.map((c) => (
              <Link
                key={c._id}
                to={`/shop/c/${c.slug}`}
                className="rounded-full border border-ui-line bg-white px-3 py-1.5 text-sm text-ui-ink hover:border-ui-brand hover:text-ui-brand transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Catalogue lockedCategorySlug={slug} />
    </div>
  );
}
