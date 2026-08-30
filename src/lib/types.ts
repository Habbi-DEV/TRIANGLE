export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

/** Driver-facing sub-status (Driver Dashboard). Independent of OrderStatus —
 *  meaningful only when order_type === 'delivery'. See
 *  public/schema_driver_dashboard.sql. */
export type DeliveryStatus = 'unassigned' | 'accepted' | 'picked_up' | 'on_the_way' | 'delivered';

export interface Category {
  id: number;
  name: string;
  icon: string;
  /** Optional photo for the square category icon on the e-menu — falls
   *  back to `icon` (emoji) when not set. */
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

/** A banner in the promo/discount carousel shown under the top bar, above
 *  the category rail. Image-only — any offer text is part of the uploaded
 *  picture itself, there's no separate title/subtitle rendered on top. */
export interface Promotion {
  id: number;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProductImage {
  id: number;
  product_id: number;
  url: string;
  sort_order: number;
}

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_available: boolean;
  stock: number;
  /** Extra gallery photos in addition to image_url (the cover photo). */
  images?: ProductImage[];
  /** Sauces the admin picked for this specific product (New/Edit product
   *  modal) — same per-product model as Supplements. May include hidden
   *  (is_active === false) ones; the customer sheet filters those out
   *  itself. */
  sauces?: Sauce[];
  /** Supplements the admin picked for this specific product (New/Edit
   *  product modal) — same per-product model as Sauces. May include
   *  hidden (is_active === false) ones; the customer sheet filters those
   *  out itself. */
  supplements?: Supplement[];
}

export interface Sauce {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
}

/** Same shape as Sauce — paid add-ons like double cheese, extra meat, kofta,
 *  double chicken. Which products offer which supplement (and, since
 *  migration v6, which sauce) is chosen per-product by the admin. */
export interface Supplement {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
}

/** Snapshot of a sauce as recorded on an order_item — never a live FK join. */
export interface OrderItemSauce {
  name: string;
  price: number;
}

/** Snapshot of a supplement as recorded on an order_item — never a live FK join. */
export interface OrderItemSupplement {
  name: string;
  price: number;
}

export interface RestaurantTable {
  id: number;
  table_number: number;
  seats: number;
  status: TableStatus;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  sauces?: OrderItemSauce[];
  supplements?: OrderItemSupplement[];
}

export interface Order {
  id: number;
  order_type: OrderType;
  status: OrderStatus;
  table_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  /** Coordinates picked by the customer on the checkout map (or
   *  reverse-geocoded from that pick). Null when they only typed a text
   *  address — every UI that uses these must fall back to the address
   *  string alone. */
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  notes: string | null;
  subtotal: number;
  /** Snapshot of settings.delivery_fee at order time (0 unless order_type
   *  is 'delivery'), so historical totals stay correct even if the fee
   *  changes later in Settings. */
  delivery_fee: number;
  total: number;
  payment_method: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  /** Driver Dashboard fields — present once schema_driver_dashboard.sql has
   *  been applied; undefined on installs that haven't migrated yet. */
  driver_id?: string | null;
  delivery_status?: DeliveryStatus;
  delivered_at?: string | null;
  /** Set when a driver cancels the order mid-route (customer unreachable,
   *  refused, not found…). Null for every other order, including
   *  admin/kitchen cancellations. */
  cancel_reason?: string | null;
}

export interface InventoryLog {
  id: number;
  product_id: number;
  change: number;
  reason: 'initial' | 'restock' | 'sale' | 'waste' | 'correction';
  notes: string | null;
  created_at: string;
}

export interface Stats {
  revenue_today: number;
  orders_today: number;
  completed_today: number;
  active_orders: number;
  avg_order: number;
  by_type: Record<OrderType, number>;
}

export interface Settings {
  id: number;
  restaurant_name: string;
  logo_url: string;
  /** Optional photo for the "All" tile in the e-menu category rail — falls
   *  back to the ✨ emoji when not set. Lives here (not on a category row)
   *  because "All" isn't a real category. */
  all_category_image_url: string | null;
  address: string;
  phone: string;
  contact_email: string;
  opening_hours: string;
  delivery_fee: number;
  delivery_min_order: number;
  new_order_sound_enabled: boolean;
  low_stock_threshold: number;
  brand_color: string;
  updated_at: string;
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
];