import type { DeliveryStatus } from './types';
import { getCurrentLang, type Lang } from './i18n';

const LABEL: Record<Lang, Record<DeliveryStatus, string>> = {
  fr: {
    unassigned: 'Disponible',
    accepted: 'Acceptée',
    picked_up: 'Récupérée',
    on_the_way: 'En route',
    delivered: 'Livrée',
  },
  ar: {
    unassigned: 'متاحة',
    accepted: 'مقبولة',
    picked_up: 'تم الاستلام',
    on_the_way: 'في الطريق',
    delivered: 'تم التوصيل',
  },
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = new Proxy({} as Record<DeliveryStatus, string>, {
  get: (_t, key: DeliveryStatus) => LABEL[getCurrentLang()][key],
});

/** action = the button the driver taps to leave the *current* state.
 *  null once delivered (terminal — no further action). */
export type DriverAction = 'accept' | 'picked_up' | 'on_the_way' | 'delivered';

const NEXT_ACTION: Record<DeliveryStatus, DriverAction | null> = {
  unassigned: 'accept',
  accepted: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'delivered',
  delivered: null,
};

const ACTION_LABEL: Record<Lang, Record<DriverAction, string>> = {
  fr: {
    accept: 'Accepter la commande',
    picked_up: 'Marquer récupérée',
    on_the_way: 'En route',
    delivered: 'Marquer livrée',
  },
  ar: {
    accept: 'قبول الطلب',
    picked_up: 'تم الاستلام',
    on_the_way: 'في الطريق',
    delivered: 'تم التوصيل',
  },
};

export function nextDriverAction(status: DeliveryStatus): DriverAction | null {
  return NEXT_ACTION[status] ?? null;
}

export function driverActionLabel(action: DriverAction): string {
  return ACTION_LABEL[getCurrentLang()][action];
}

// Simple 4-step progress index for a stepper UI (0 = accepted, 3 = delivered).
// 'unassigned' isn't shown in the active-order stepper (it isn't accepted
// yet), so it maps to -1.
const STEP_INDEX: Record<DeliveryStatus, number> = {
  unassigned: -1,
  accepted: 0,
  picked_up: 1,
  on_the_way: 2,
  delivered: 3,
};

export function deliveryStepIndex(status: DeliveryStatus): number {
  return STEP_INDEX[status];
}

// Reasons a driver can give when cancelling a delivery mid-route (arrived
// but the customer isn't reachable, refused it, etc.) — see
// CancelOrderModal + api/driver-orders.js's 'cancel' action.
export type DriverCancelReason = 'no_answer' | 'refused' | 'not_found' | 'other';

const CANCEL_REASON_LABEL: Record<Lang, Record<DriverCancelReason, string>> = {
  fr: {
    no_answer: 'Le client ne répond pas au téléphone',
    refused: 'Le client a refusé la commande',
    not_found: "Impossible de trouver le client / l'adresse",
    other: 'Autre raison',
  },
  ar: {
    no_answer: 'الزبون لا يجيب على الهاتف',
    refused: 'الزبون رفض استلام الطلبية',
    not_found: 'تعذر العثور على الزبون / العنوان',
    other: 'سبب آخر',
  },
};

export const DRIVER_CANCEL_REASONS: DriverCancelReason[] = ['no_answer', 'refused', 'not_found', 'other'];

export function driverCancelReasonLabel(reason: DriverCancelReason): string {
  return CANCEL_REASON_LABEL[getCurrentLang()][reason];
}
