import { getDb, OutboxRow } from '../db/sqlite';
import { api } from '../api/client';
import { secureStorage } from '../store/secureStore';

export type OutboxListener = (pendingCount: number, recentOrders: OutboxRow[]) => void;

class OutboxWorker {
  private static instance: OutboxWorker;
  private isProcessing = false;
  private retryTimer: any = null;
  private listeners: Set<OutboxListener> = new Set();
  private backoffDelays = [2000, 5000, 15000, 60000]; // 2s, 5s, 15s, 60s

  private constructor() {
    // Listen to network status changes
    api.onConnectionChange((online) => {
      if (online) {
        this.processQueue();
      }
    });
  }

  public static getInstance(): OutboxWorker {
    if (!OutboxWorker.instance) {
      OutboxWorker.instance = new OutboxWorker();
    }
    return OutboxWorker.instance;
  }

  public subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private async notify() {
    try {
      const db = await getDb();
      const pending = await db.getPendingOutbox();
      const all = await db.getAllOrders(50);
      this.listeners.forEach(fn => fn(pending.length, all));
    } catch (_) {}
  }

  /**
   * Enqueue a new order into the durable SQLite outbox.
   * Atomic, guaranteed persistence before any network attempt.
   */
  public async enqueueOrder(order: {
    clientOrderId: string;
    tableId: number;
    tableName: string;
    items: Array<{ productId: number; name: string; qty: number; note?: string }>;
  }): Promise<number> {
    const db = await getDb();
    const activeWaiter = await secureStorage.getActiveWaiter();
    const waiterId = activeWaiter ? activeWaiter.id : 1;

    // Build human-readable items summary for My Orders screen (e.g. "2× موهيتو ريدبول، 1× وافل نوتيلا")
    const itemsSummary = order.items
      .map(item => `${item.qty}× ${item.name}${item.note ? ` (${item.note})` : ''}`)
      .join('، ');

    const payload = {
      clientOrderId: order.clientOrderId,
      tableId: order.tableId,
      waiterId: waiterId,
      waiterName: activeWaiter ? activeWaiter.name : 'الويتر',
      items: order.items.map(item => ({
        productId: item.productId,
        qty: item.qty,
        note: item.note || ''
      }))
    };

    const rowId = await db.insertOutbox({
      clientOrderId: order.clientOrderId,
      tableId: order.tableId,
      tableName: order.tableName,
      waiterId,
      payloadJson: JSON.stringify(payload),
      itemsSummary,
      createdAt: Date.now()
    });

    await this.notify();

    // Immediately trigger processing in the background
    this.processQueue();

    return rowId;
  }

  /**
   * Process all pending orders in FIFO order (createdAt ascending)
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = await getDb();
      const pending = await db.getPendingOutbox();

      if (pending.length === 0) {
        this.isProcessing = false;
        return;
      }

      for (const item of pending) {
        let payload: any;
        try {
          payload = JSON.parse(item.payloadJson);
        } catch (e) {
          await db.markOutboxFailed(item.clientOrderId, 'تنسيق البيانات غير صالح', true);
          continue;
        }

        try {
          const res = await api.sendOrder(payload);

          // Hard Rule: ONLY mark sent if server returned ok: true
          if (res && res.ok) {
            await db.markOutboxSent(item.clientOrderId);
          } else {
            throw new Error(res?.message || 'لم يتم تأكيد الطلب');
          }
        } catch (err: any) {
          const status = err.status || 0;
          const isBusinessError = status === 400 || status === 403 || status === 409;

          if (isBusinessError) {
            // Business error (e.g. table closed, hall forbidden, inactive product) -> mark failed permanently
            const reason = err.message || 'فشل قبول الطلب بالكاشير';
            await db.markOutboxFailed(item.clientOrderId, reason, true);
          } else {
            // Temporary network error -> increment attempt and keep pending for next backoff cycle
            const reason = err.message || 'خطأ في الاتصال بالشبكة';
            await db.markOutboxFailed(item.clientOrderId, reason, false);
            // Break loop so subsequent orders wait in sequence
            this.scheduleNextRetry(item.attempts);
            break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
      await this.notify();
    }
  }

  /**
   * Exponential backoff timer
   */
  private scheduleNextRetry(currentAttempts: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delayIndex = Math.min(currentAttempts, this.backoffDelays.length - 1);
    const delay = this.backoffDelays[delayIndex];

    this.retryTimer = setTimeout(() => {
      this.processQueue();
    }, delay);
  }

  /**
   * Manual retry trigger for "جرّب الإرسال دلوقتي" button
   */
  public async retryNow(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.processQueue();
  }
}

export const outbox = OutboxWorker.getInstance();
