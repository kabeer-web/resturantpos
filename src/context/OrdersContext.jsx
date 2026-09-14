import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { playNotificationSound, notifyBrowser } from '../lib/notify';

const OrdersContext = createContext(null);
export const useOrders = () => useContext(OrdersContext);

// Single source of truth for all staff-facing screens (Dashboard, KDS, Billing).
// Loads orders + their items, then keeps them live via postgres_changes so
// nobody needs to poll or refresh.
export const OrdersProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: ordersData, error: oErr }, { data: tablesData, error: tErr }] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: true }),
      supabase.from('restaurant_tables').select('*').order('table_number'),
    ]);
    if (oErr) console.error(oErr);
    if (tErr) console.error(tErr);
    setOrders(ordersData || []);
    setTables(tablesData || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`orders_live_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  // Separate listener purely for alerting staff the instant a brand-new
  // order lands (sound + browser notification), independent of the
  // refresh channel above so it fires exactly once per new order.
  useEffect(() => {
    const channel = supabase
      .channel(`orders_new_alert_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new;
        if (row?.status === 'pending_confirmation') {
          setNewOrderAlert(row);
          playNotificationSound();
          notifyBrowser('New Order — BeerFlow', `${row.customer_name || 'A customer'} · Rs. ${row.total}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const dismissNewOrderAlert = useCallback(() => setNewOrderAlert(null), []);

  const confirmOrder = async (orderId) => {
    const { error } = await supabase.rpc('confirm_order', { p_order_id: orderId });
    if (error) alert(error.message);
  };

  const updateStatus = async (orderId, status) => {
    const { error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_status: status });
    if (error) alert(error.message);
  };

  return (
    <OrdersContext.Provider value={{ orders, tables, loading, refresh, confirmOrder, updateStatus, newOrderAlert, dismissNewOrderAlert }}>
      {children}
    </OrdersContext.Provider>
  );
};
