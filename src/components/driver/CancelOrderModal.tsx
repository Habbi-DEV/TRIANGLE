import { useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import { useLang } from '../../lib/i18n';
import { DRIVER_CANCEL_REASONS, driverCancelReasonLabel, type DriverCancelReason } from '../../lib/driverStatus';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: DriverCancelReason, note: string) => void;
  busy: boolean;
}

export default function CancelOrderModal({ open, onClose, onConfirm, busy }: Props) {
  const { t } = useLang();
  const [reason, setReason] = useState<DriverCancelReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleClose = () => {
    if (busy) return;
    setReason(null);
    setNote('');
    setError('');
    onClose();
  };

  const confirm = () => {
    if (!reason) return;
    if (reason === 'other' && !note.trim()) {
      setError(t('driver.cancel_order.note_required'));
      return;
    }
    setError('');
    onConfirm(reason, note.trim());
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('driver.cancel_order.title')}>
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-100">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>{t('driver.cancel_order.prompt')}</p>
        </div>

        <div className="space-y-2">
          {DRIVER_CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`w-full rounded-xl border-2 px-3.5 py-2.5 text-start text-sm font-semibold transition ${
                reason === r
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-zinc-100 bg-white text-zinc-600 hover:border-zinc-200'
              }`}
            >
              {driverCancelReasonLabel(r)}
            </button>
          ))}
        </div>

        {reason === 'other' && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('driver.cancel_order.note_placeholder')}
            rows={2}
            className="w-full resize-none rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-red-200"
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
            {t('driver.cancel_order.back')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !reason}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {busy ? t('driver.cancel_order.cancelling') : t('driver.cancel_order.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
