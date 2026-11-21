const { z } = require('zod');

// 1. Pairing
const PairRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'رمز الاقتران يجب أن يتكون من 6 أرقام'),
  deviceName: z.string().min(1).max(50).default('موبايل ويتر'),
  platform: z.enum(['android', 'ios', 'web', 'other']).default('android')
});

const PairResponseSchema = z.object({
  ok: z.boolean(),
  deviceToken: z.string().min(16),
  cafe: z.object({
    name: z.string(),
    code: z.string().optional()
  }),
  menuRev: z.number().int().nonnegative()
});

// 2. Users & Login
const UserListItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  role: z.string(),
  assignedHalls: z.array(z.string()).default(['ALL'])
});

const WaiterLoginRequestSchema = z.object({
  userId: z.number().int().positive('معرف الويتر غير صالح'),
  pin: z.string().regex(/^\d{4}$/, 'الرقم السري يجب أن يتكون من 4 أرقام')
});

const WaiterLoginResponseSchema = z.object({
  ok: z.boolean(),
  token: z.string().min(16),
  waiter: z.object({
    id: z.number().int(),
    name: z.string(),
    assignedHalls: z.array(z.string()).default(['ALL'])
  })
});

// 3. Menu
const ProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  categoryId: z.number().int(),
  hasNote: z.boolean().default(false),
  available: z.boolean().default(true)
});

const CategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  displayOrder: z.number().int().optional()
});

const MenuResponseSchema = z.object({
  rev: z.number().int().nonnegative(),
  unchanged: z.boolean().optional(),
  categories: z.array(CategorySchema).optional(),
  products: z.array(ProductSchema).optional()
});

// 4. Tables
const TableStateSchema = z.enum(['free', 'busy', 'mine', 'waiting']);

const TableItemSchema = z.object({
  id: z.number().int(),
  tableNumber: z.union([z.string(), z.number()]),
  hall: z.string(),
  state: TableStateSchema,
  itemCount: z.number().int().nonnegative().default(0),
  sinceMinutes: z.number().int().nonnegative().default(0),
  meta: z.string().optional(),
  currentOrderId: z.string().optional()
});

const TablesResponseSchema = z.object({
  shift: z.object({
    open: z.boolean(),
    user: z.string().optional(),
    shiftName: z.string().optional()
  }),
  halls: z.array(z.string()),
  tables: z.array(TableItemSchema)
});

// 5. Orders
const OrderItemSchema = z.object({
  productId: z.number().int().positive('معرف الصنف غير صالح'),
  qty: z.number().int().min(1, 'الكمية يجب أن تكون 1 على الأقل').max(99, 'الحد الأقصى للكمية هو 99'),
  note: z.string().max(120, 'الملاحظة يجب ألا تتجاوز 120 حرف').optional().default('')
});

const CreateOrderRequestSchema = z.object({
  clientOrderId: z.string().min(8, 'معرف الطلب غير صالح'),
  tableId: z.number().int().positive('رقم الطاولة غير صالح'),
  items: z.array(OrderItemSchema).min(1, 'يجب إضافة صنف واحد على الأقل').max(60, 'الحد الأقصى 60 صنف في الطلب الواحد')
});

const CreateOrderResponseSchema = z.object({
  ok: z.boolean(),
  orderId: z.union([z.string(), z.number()]),
  status: z.enum(['received', 'pending', 'appended']),
  appended: z.boolean().optional(),
  tableId: z.number().int(),
  receivedAt: z.string()
});

// 6. Cloud Snapshots & Relay
const PaymentSplitSchema = z.object({
  cash: z.number().nonnegative().default(0),
  card: z.number().nonnegative().default(0),
  wallet: z.number().nonnegative().default(0)
});

const AlertItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  sub: z.string(),
  dot: z.string().default('#EE7F14'),
  at: z.string()
});

const SnapshotSchema = z.object({
  cafeCode: z.string(),
  timestamp: z.string(),
  salesToday: z.number().nonnegative().default(0),
  invoicesCount: z.number().int().nonnegative().default(0),
  cancelledCount: z.number().int().nonnegative().default(0),
  openShift: z.object({
    user: z.string(),
    since: z.string(),
    shiftId: z.number().int().optional()
  }).nullable().optional(),
  paymentSplit: PaymentSplitSchema,
  alerts: z.array(AlertItemSchema).default([]),
  seq: z.number().int().nonnegative()
});

const DailyStatSchema = z.object({
  date: z.string(),
  sales: z.number().nonnegative(),
  invoices: z.number().int().nonnegative()
});

const TopProductSchema = z.object({
  name: z.string(),
  qty: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100).default(0)
});

const AdminReportSchema = z.object({
  range: z.enum(['today', '7d', '30d', 'custom']),
  totalSales: z.number().nonnegative(),
  invoicesCount: z.number().int().nonnegative(),
  avgInvoice: z.number().nonnegative(),
  dailyStats: z.array(DailyStatSchema),
  topProducts: z.array(TopProductSchema)
});

module.exports = {
  PairRequestSchema,
  PairResponseSchema,
  UserListItemSchema,
  WaiterLoginRequestSchema,
  WaiterLoginResponseSchema,
  ProductSchema,
  CategorySchema,
  MenuResponseSchema,
  TableStateSchema,
  TableItemSchema,
  TablesResponseSchema,
  OrderItemSchema,
  CreateOrderRequestSchema,
  CreateOrderResponseSchema,
  PaymentSplitSchema,
  AlertItemSchema,
  SnapshotSchema,
  DailyStatSchema,
  TopProductSchema,
  AdminReportSchema
};
