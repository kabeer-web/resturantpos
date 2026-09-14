import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, TrendingUp, ShoppingBag, AlertTriangle, UtensilsCrossed,
  Clock, Wallet,
} from 'lucide-react';
import { useOrders } from '../context/OrdersContext';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/pricing';

const STATUS_LABEL = {
  pending_confirmation: 'Pending Confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
};
const STATUS_CLASS = {
  pending_confirmation: 'bg-warning-soft text-warning border-warning/30',
  confirmed: 'bg-accent-soft text-accent border-accent/30',
  preparing: 'bg-brand-end/10 text-brand-end border-brand-end/30',
  ready: 'bg-success-soft text-success border-success/30',
};
const TABLE_CLASS = {
  available: 'bg-success-soft border-success/30 text-success',
  occupied: 'bg-danger-soft border-danger/30 text-danger',
  waiting_for_bill: 'bg-warning-soft border-warning/30 text-warning',
  needs_bill: 'bg-warning-soft border-warning/30 text-warning',
  cleaning: 'bg-warning-soft border-warning/30 text-warning',
  inactive: 'bg-surface-hover border-border text-ink-faint',
};

export default function Dashboard() {
  const { orders, tables, loading, confirmOrder, updateStatus } = useOrders();
  const [lowStock, setLowStock] = useState([]);
  const [todaySales, setTodaySales] = useState(0);
  const [todayOrderCount, setTodayOrderCount] = useState(0);

  useEffect(() => {
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [{ data: inv }, { data: paid }] = await Promise.all([
        supabase.from('inventory_items').select('id,name,current_stock,low_stock_threshold,unit')
          .eq('is_active', true),
        supabase.from('orders').select('id,total,status,created_at')
          .gte('created_at', start.toISOString())
          .neq('status', 'cancelled'),
      ]);
      const low = (inv || []).filter((i) => Number(i.current_stock) <= Number(i.low_stock_threshold));
      setLowStock(low);
      const list = paid || [];
      setTodayOrderCount(list.length);
      setTodaySales(list.reduce((s, o) => s + Number(o.total || 0), 0));
    })();
  }, [orders]);

  const pendingDelivery = orders.filter((o) => o.status === 'pending_confirmation');
  const active = orders.filter((o) => !['pending_confirmation', 'completed', 'cancelled'].includes(o.status));
  const aov = todayOrderCount ? todaySales / todayOrderCount : 0;
  const occupiedTables = tables.filter((t) => t.status === 'occupied' || t.status === 'waiting_for_bill' || t.status === 'needs_bill').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight mb-6">Dashboard</h1>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Today's Sales", value: formatMoney(todaySales), icon: Wallet, accent: 'text-success' },
          { label: "Today's Orders", value: todayOrderCount, icon: ShoppingBag, accent: 'text-ink' },
          { label: 'Avg Order Value', value: formatMoney(aov), icon: TrendingUp, accent: 'text-accent' },
          { label: 'Active Tables', value: `${occupiedTables}/${tables.length}`, icon: UtensilsCrossed, accent: 'text-warning' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl bg-surface border border-border px-4 py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-ink-faint uppercase tracking-wider">{label}</p>
                <p className={`text-xl font-semibold mt-0.5 tabular-nums ${accent}`}>{value}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-surface-raised border border-border flex items-center justify-center">
                <Icon size={16} className={accent} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Low Stock ({lowStock.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 12).map((i) => (
              <div key={i.id} className="px-3 py-2 rounded-xl bg-warning-soft border border-warning/20 text-sm">
                <span className="font-medium text-ink">{i.name}</span>
                <span className="text-warning ml-2 tabular-nums">{i.current_stock} {i.unit}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tables */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tables.map((t) => (
          <div key={t.id} className={`px-3.5 py-2 rounded-xl border text-sm font-semibold ${TABLE_CLASS[t.status] || TABLE_CLASS.cleaning}`}>
            Table {t.table_number} — {(t.status || '').replace(/_/g, ' ')}
          </div>
        ))}
      </div>

      {pendingDelivery.length > 0 && (
        <section className="mb-8">
          <h2 className="font-semibold text-warning mb-3">Pending Confirmation ({pendingDelivery.length})</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingDelivery.map((o) => (
              <div key={o.id} className="bg-surface rounded-2xl p-4 border border-warning/30">
                <p className="font-semibold text-ink">{o.customer_name}</p>
                <p className="text-ink-faint text-sm">{o.customer_phone}</p>
                <p className="text-ink-faint text-sm mb-2">{o.delivery_address}</p>
                <ul className="text-sm text-ink-muted mb-3 space-y-0.5">
                  {(o.order_items || []).map((li) => (
                    <li key={li.id}>
                      {li.qty}× {li.item_name}
                      {li.variant_name ? ` (${li.variant_name})` : ''}
                    </li>
                  ))}
                </ul>
                <p className="font-ticket font-bold text-accent mb-3">{formatMoney(o.total)}</p>
                <button onClick={() => confirmOrder(o.id)}
                  className="w-full py-2.5 rounded-xl bg-brand-gradient text-white font-bold text-sm transition-transform active:scale-[0.98]">
                  Confirm Order → Kitchen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold text-ink-muted mb-3 flex items-center gap-2">
          <Clock size={16} /> Active Orders ({active.length})
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-ink-faint text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence initial={false}>
              {active.map((o) => (
                <motion.div
                  key={o.id}
                  layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-surface rounded-2xl p-4 border border-border"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="font-semibold text-ink text-sm truncate">
                      {o.order_type === 'dine_in' ? `Table ${tables.find((t) => t.id === o.table_id)?.table_number || '?'}` : o.order_type}
                      {o.order_no ? ` · #${o.order_no}` : ''}
                    </p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${STATUS_CLASS[o.status] || ''}`}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </div>
                  <ul className="text-sm text-ink-muted mb-3 space-y-0.5">
                    {(o.order_items || []).map((li) => (
                      <li key={li.id}>
                        {li.qty}× {li.item_name}
                        {li.variant_name ? ` · ${li.variant_name}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="font-ticket font-bold text-ink mb-3">{formatMoney(o.total)}</p>
                  <div className="flex gap-2">
                    {o.status === 'confirmed' && (
                      <button onClick={() => updateStatus(o.id, 'preparing')}
                        className="flex-1 py-2 rounded-xl bg-accent-soft text-accent text-xs font-bold">Preparing</button>
                    )}
                    {o.status === 'preparing' && (
                      <button onClick={() => updateStatus(o.id, 'ready')}
                        className="flex-1 py-2 rounded-xl bg-success-soft text-success text-xs font-bold">Ready</button>
                    )}
                    {o.status === 'ready' && (
                      <button onClick={() => updateStatus(o.id, 'completed')}
                        className="flex-1 py-2 rounded-xl bg-brand-gradient text-white text-xs font-bold">Complete</button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
