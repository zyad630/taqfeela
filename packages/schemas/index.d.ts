import { z } from 'zod';
import {
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
} from './index';

export type PairRequest = z.infer<typeof PairRequestSchema>;
export type PairResponse = z.infer<typeof PairResponseSchema>;
export type UserListItem = z.infer<typeof UserListItemSchema>;
export type WaiterLoginRequest = z.infer<typeof WaiterLoginRequestSchema>;
export type WaiterLoginResponse = z.infer<typeof WaiterLoginResponseSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
export type TableState = z.infer<typeof TableStateSchema>;
export type TableItem = z.infer<typeof TableItemSchema>;
export type TablesResponse = z.infer<typeof TablesResponseSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;
export type PaymentSplit = z.infer<typeof PaymentSplitSchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type DailyStat = z.infer<typeof DailyStatSchema>;
export type TopProduct = z.infer<typeof TopProductSchema>;
export type AdminReport = z.infer<typeof AdminReportSchema>;

export {
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
