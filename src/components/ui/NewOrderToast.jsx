import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { useOrders } from '../../context/OrdersContext';
import { formatMoney } from '../../lib/pricing';

export default function NewOrderToast() {
  const { newOrderAlert, dismissNewOrderAlert } = useOrders();
  const navigate = useNavigate();

  // Auto-dismiss so toasts don't pile up if staff is away from the screen.
  useEffect(() => {
    if (!newOrderAlert) return;
    const t = setTimeout(() => dismissNewOrderAlert(), 12000);
    return () => clearTimeout(t);
  }, [newOrderAlert, dismissNewOrderAlert]);

  return (
    <AnimatePresence>
      {newOrderAlert && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-4 right-4 z-[200] w-80 bg-surface border border-warning/40 rounded-2xl shadow-glow-sm p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning-soft flex items-center justify-center flex-shrink-0">
              <Bell size={16} className="text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink text-sm">New Order!</p>
              <p className="text-ink-muted text-sm truncate">{newOrderAlert.customer_name || 'Customer'}</p>
              <p className="font-ticket font-bold text-accent text-sm mt-1">{formatMoney(newOrderAlert.total)}</p>
              <button
                onClick={() => { navigate('/dashboard'); dismissNewOrderAlert(); }}
                className="mt-2 text-xs font-bold text-accent hover:underline"
              >
                View →
              </button>
            </div>
            <button onClick={dismissNewOrderAlert} className="text-ink-faint hover:text-ink flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
