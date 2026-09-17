import { useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import { useLang } from '../../lib/i18n';
import { CUSTOMER_CANCEL_REASONS, type CustomerCancelReason } from '../../lib/orderCancellation';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: CustomerCancelReason, note: string) => void;
  busy: boolean;
}

export default function CancelOrderConfirmModal({ open, onClose, onConfirm, busy }: Props) {
  const { t } = useLang();
  const [reason, setReason] = useState<CustomerCancelReason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleClose = () => {
    if (busy) return;
    setReason('');
    setNote('');
    setError('');
    onClose();
  };

  const confirm = () => {
    if (!reason) {
      setError(t('shop.cancel_order.reason_placeholder'));
      return;
    }
    if (reason === 'other' && !note.trim()) {
      setError(t('shop.cancel_order.note_required'));
      return;
    }
    setError('');
    onConfirm(reason, note.trim());
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('shop.cancel_order.title')}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-100">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>{t('shop.cancel_order.prompt')}</p>
        </div>

        <div>
          <label htmlFor="cancel-reason" className="mb-1.5 block text-xs font-semibold text-zinc-500">
            {t('shop.cancel_order.reason_label')}
          </label>
          <select
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as CustomerCancelReason)}
            disabled={busy}
            className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-medium text-zinc-800 outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
          >
            <option value="" disabled>
              {t('shop.cancel_order.reason_placeholder')}
            </option>
            {CUSTOMER_CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`shop.cancel_order.reason.${r}`)}
              </option>
            ))}
          </select>
        </div>

        {reason === 'other' && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('shop.cancel_order.note_placeholder')}
            rows={2}
            disabled={busy}
            className="w-full resize-none rounded-xl border border-zinc-200 px-3.5 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-red-200 disabled:opacity-60"
          />
        )}

        {error && <p className="text-xs font-medium text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="flex-1 rounded-full bg-zinc-100 py-3 text-sm font-bold text-zinc-700 transition active:scale-[0.98] disabled:opacity-60"
          >
            {t('shop.cancel_order.back')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !reason}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {busy ? t('shop.cancel_order.cancelling') : t('shop.cancel_order.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
