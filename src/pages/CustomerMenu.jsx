import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/pricing';

// Reached two ways:
//   /menu?table=<qr_token>   -> Dine-in, table is locked from the URL, cannot be changed
//   /menu                    -> Delivery, customer fills in name/phone/address
export default function CustomerMenu() {
  const [searchParams] = useSearchParams();
  const tableToken = searchParams.get('table'); // null => delivery mode

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tableInfo, setTableInfo] = useState(null);
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState({});
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadMenu = async () => {
      const [{ data: cats }, { data: menuItems }] = await Promise.all([
        supabase.from('menu_categories').select('*').order('sort_order'),
        supabase.from('menu_items').select('*').eq('is_available', true).order('name'),
      ]);
      if (!mounted) return;
      setCategories(cats || []);
      setItems(menuItems || []);
    };

    loadMenu();
    if (tableToken) {
      (async () => {
        const { data: table } = await supabase.from('restaurant_tables').select('*').eq('qr_token', tableToken).maybeSingle();
        if (mounted) setTableInfo(table);
      })();
    }

    // Live menu: if staff add a new dish or mark one unavailable, customers
    // already scanning the QR code / browsing the menu see it update instantly.
    const channel = supabase
      .channel(`customer_menu_live_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, loadMenu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, loadMenu)
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [tableToken]);

  const itemsByCategory = useMemo(() => {
    const map = {};
    for (const cat of categories) map[cat.id] = [];
    for (const it of items) {
      if (!map[it.category_id]) map[it.category_id] = [];
      map[it.category_id].push(it);
    }
    return map;
  }, [categories, items]);

  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => {
      const item = items.find((i) => i.id === id);
      return item ? { item, qty, notes: notes[id] || '' } : null;
    }).filter(Boolean),
    [cart, notes, items]
  );
  const total = cartLines.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  const setQty = (id, qty) => setCart((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const placeOrder = async () => {
    setError('');
    if (cartLines.length === 0) { setError('Add at least one item first.'); return; }
    if (tableToken && !tableInfo) { setError('Invalid table QR code.'); return; }
    if (!tableToken && (!customer.name || !customer.phone || !customer.address)) {
      setError('Please fill in your name, phone, and delivery address.');
      return;
    }
    setPlacing(true);
    const { data, error: rpcError } = await supabase.rpc('place_order', {
      p_order_type: tableToken ? 'dine_in' : 'delivery',
      p_table_qr_token: tableToken || null,
      p_customer_name: customer.name || null,
      p_customer_phone: customer.phone || null,
      p_delivery_address: customer.address || null,
      p_items: cartLines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, notes: l.notes })),
    });
    setPlacing(false);
    if (rpcError) { setError(rpcError.message); return; }
    setPlacedOrder(data);
    setCart({});
    setNotes({});
  };

  if (tableToken && tableInfo === null && items.length === 0) {
    return <div className="min-h-screen flex items-center justify-center text-ink-faint bg-bg">Loading menu…</div>;
  }
  if (tableToken && tableInfo === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center bg-bg p-6">
        <p className="text-danger font-bold">Invalid table QR code.</p>
        <p className="text-ink-faint text-sm mt-2">Please ask staff for a fresh code.</p>
      </div>
    );
  }

  if (placedOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full bg-surface rounded-2xl p-6 text-center border border-success/30"
        >
          <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-3 animate-success-check">
            <CheckCircle2 size={28} className="text-success" />
          </div>
          <h2 className="font-display text-xl font-semibold text-ink mb-1">Order Placed!</h2>
          <p className="text-ink-muted text-sm mb-4">
            {tableToken ? 'Your order is on its way to the kitchen.' : "We'll call you shortly to confirm your order."}
          </p>
          <p className="text-brand-end font-ticket font-bold text-2xl">{formatMoney(placedOrder.total)}</p>
          <button onClick={() => setPlacedOrder(null)}
            className="mt-6 w-full py-3 rounded-xl bg-brand-gradient text-white font-bold transition-transform active:scale-[0.98]">
            Order More
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-32">
      <header className="p-5 border-b border-border sticky top-0 bg-bg/95 backdrop-blur z-10 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={16} className="text-white" />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold text-ink leading-tight">Our Menu</h1>
          {tableInfo ? (
            <p className="text-success text-xs font-semibold">Table {tableInfo.table_number}</p>
          ) : (
            <p className="text-ink-faint text-xs">Home Delivery</p>
          )}
        </div>
      </header>

      <main className="p-4 space-y-8 max-w-lg mx-auto">
        {categories.map((cat) => (
          <section key={cat.id}>
            <h2 className="font-display text-lg font-semibold text-brand-end mb-3">{cat.name}</h2>
            <div className="space-y-3">
              {(itemsByCategory[cat.id] || []).map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-surface rounded-xl p-3 border border-border">
                  <div className="w-14 h-14 rounded-lg bg-surface-raised border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      : <UtensilsCrossed size={18} className="text-ink-faint" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-sm">{item.name}</p>
                    <p className="text-ink-faint text-sm font-ticket">{formatMoney(item.price)}</p>
                    {item.stock_qty !== null && item.stock_qty <= 5 && (
                      <p className="text-warning text-xs mt-0.5">Only {item.stock_qty} left</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button onClick={() => setQty(item.id, (cart[item.id] || 0) - 1)}
                      className="w-8 h-8 rounded-full bg-surface-raised border border-border text-ink-muted flex items-center justify-center">
                      <Minus size={13} />
                    </button>
                    <span className="w-5 text-center text-ink font-semibold">{cart[item.id] || 0}</span>
                    <button onClick={() => setQty(item.id, (cart[item.id] || 0) + 1)}
                      className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center">
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {!tableToken && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-brand-end">Your Details</h2>
            <input placeholder="Full Name" value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              className="w-full p-3 rounded-xl bg-surface border border-border outline-none focus:border-accent transition-colors text-sm" />
            <input placeholder="Phone Number" value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              className="w-full p-3 rounded-xl bg-surface border border-border outline-none focus:border-accent transition-colors text-sm" />
            <textarea placeholder="Delivery Address" value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              className="w-full p-3 rounded-xl bg-surface border border-border outline-none focus:border-accent transition-colors text-sm resize-none" rows={2} />
          </section>
        )}

        {error && <p className="text-danger text-sm text-center">{error}</p>}
      </main>

      {cartLines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-4">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ink-faint">{cartLines.length} item(s)</p>
              <p className="font-ticket font-bold text-lg text-brand-end">{formatMoney(total)}</p>
            </div>
            <button onClick={placeOrder} disabled={placing}
              className="flex-1 py-3 rounded-xl bg-brand-gradient text-white font-bold disabled:opacity-50 transition-transform active:scale-[0.98]">
              {placing ? 'Placing…' : 'Place Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
