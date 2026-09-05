import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import { SHOP_TOKEN_KEY } from '../api/client';
import { track } from '../lib/analytics';

const CartContext = createContext(null);
const STORAGE_KEY = 'lytronix_shop_cart_v1';
const SAVED_KEY = 'lytronix_shop_saved_v1';

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveLocal(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota / privacy-mode */
  }
}

// Guests can still save products — the ids live in localStorage only until
// they sign in, at which point they're merged into the server wishlist.
function loadLocalSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveLocalSaved(ids) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
const isAuthed = () => Boolean(localStorage.getItem(SHOP_TOKEN_KEY));

function lineFromProduct(product, qty) {
  return {
    productId: product._id || product.productId,
    slug: product.slug,
    name: product.name,
    description: product.description || '',
    unitPrice: product.price ?? product.unitPrice,
    deliveryCharge: product.deliveryCharge || 0,
    imageUrl: product.imageUrl || product.images?.[0] || '',
    trackInventory: product.trackInventory,
    stock: product.trackInventory ? product.stock : null,
    paymentPolicy: product.paymentPolicy,
    quantity: qty,
  };
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => (isAuthed() ? [] : loadLocal()));
  const [savedIds, setSavedIds] = useState(() => (isAuthed() ? [] : loadLocalSaved()));
  const [ready, setReady] = useState(!isAuthed());
  const authedRef = useRef(isAuthed());

  // ----- server sync helpers -----
  const loadServerCart = useCallback(async () => {
    try {
      const { items: serverItems } = await api.getServerCart();
      setItems(serverItems);
    } catch {
      /* leave as-is */
    } finally {
      setReady(true);
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    try {
      const { ids } = await api.getWishlistIds();
      setSavedIds(ids);
    } catch {
      setSavedIds([]);
    }
  }, []);

  // ----- initial load -----
  useEffect(() => {
    if (isAuthed()) {
      loadServerCart();
      loadWishlist();
    }
  }, [loadServerCart, loadWishlist]);

  // ----- react to login / logout fired by CustomerAuthContext -----
  useEffect(() => {
    const onLogin = async () => {
      authedRef.current = true;
      const local = loadLocal();
      try {
        if (local.length) {
          const { items: merged } = await api.mergeServerCart(
            local.map((i) => ({ productId: i.productId, quantity: i.quantity }))
          );
          setItems(merged);
        } else {
          await loadServerCart();
        }
      } catch {
        await loadServerCart();
      }
      saveLocal([]);

      // Merge guest-saved products into the server wishlist, then reload.
      const localSaved = loadLocalSaved();
      if (localSaved.length) {
        await Promise.allSettled(localSaved.map((id) => api.addToWishlist(id)));
        saveLocalSaved([]);
      }
      loadWishlist();
    };
    const onLogout = () => {
      authedRef.current = false;
      setItems([]);
      setSavedIds([]);
      saveLocal([]);
      saveLocalSaved([]);
    };
    window.addEventListener('lytronix:login', onLogin);
    window.addEventListener('lytronix:logout', onLogout);
    return () => {
      window.removeEventListener('lytronix:login', onLogin);
      window.removeEventListener('lytronix:logout', onLogout);
    };
  }, [loadServerCart, loadWishlist]);

  // ----- persist guest cart + saved list -----
  useEffect(() => {
    if (!authedRef.current) saveLocal(items);
  }, [items]);
  useEffect(() => {
    if (!authedRef.current) saveLocalSaved(savedIds);
  }, [savedIds]);

  // ----- mutations (optimistic for guests, server round-trip for members) -----
  const addItem = useCallback(async (product, qty = 1) => {
    const id = product._id || product.productId;
    if (authedRef.current) {
      try {
        const { items: next } = await api.addServerCartItem(id, qty);
        setItems(next);
      } catch {
        /* ignore */
      }
    } else {
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === id);
        if (existing) {
          return prev.map((i) => (i.productId === id ? { ...i, quantity: i.quantity + qty } : i));
        }
        return [...prev, lineFromProduct(product, qty)];
      });
    }
    track('add_to_cart', { productId: id });
  }, []);

  const setQuantity = useCallback(async (productId, qty) => {
    if (authedRef.current) {
      try {
        const { items: next } = await api.setServerCartItem(productId, qty);
        setItems(next);
      } catch {
        /* ignore */
      }
    } else {
      setItems((prev) => {
        if (qty <= 0) return prev.filter((i) => i.productId !== productId);
        return prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i));
      });
    }
  }, []);

  const removeItem = useCallback(
    (productId) => setQuantity(productId, 0),
    [setQuantity]
  );

  const clearCart = useCallback(async () => {
    if (authedRef.current) {
      try {
        await api.replaceServerCart([]);
      } catch {
        /* ignore */
      }
    }
    setItems([]);
    saveLocal([]);
  }, []);

  // ----- wishlist -----
  const isSaved = useCallback((productId) => savedIds.includes(productId), [savedIds]);

  const toggleSaved = useCallback(
    async (productId) => {
      const currentlySaved = savedIds.includes(productId);
      setSavedIds((prev) =>
        currentlySaved ? prev.filter((x) => x !== productId) : [...prev, productId]
      );

      // Guests: localStorage only (the persist effect handles saving).
      if (!authedRef.current) {
        return { ok: true, saved: !currentlySaved, guest: true };
      }

      try {
        if (currentlySaved) await api.removeFromWishlist(productId);
        else await api.addToWishlist(productId);
        return { ok: true, saved: !currentlySaved };
      } catch {
        setSavedIds((prev) =>
          currentlySaved ? [...prev, productId] : prev.filter((x) => x !== productId)
        );
        return { ok: false, reason: 'error' };
      }
    },
    [savedIds]
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0),
    [items]
  );
  const deliveryTotal = useMemo(
    () => items.reduce((s, i) => s + (i.deliveryCharge || 0) * i.quantity, 0),
    [items]
  );

  const value = {
    items,
    ready,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
    count,
    subtotal,
    deliveryTotal,
    savedIds,
    isSaved,
    toggleSaved,
    reloadWishlist: loadWishlist,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
