import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLang } from '../../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide }: Props) {
  const { t } = useLang();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className={`max-h-[92vh] w-full overflow-y-auto thin-scroll rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-zinc-900">{title}</h3>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
