import { Platform } from 'react-native';

export interface OutboxRow {
  id: number;
  clientOrderId: string;
  tableId: number;
  tableName: string;
  waiterId: number;
  payloadJson: string;
  itemsSummary: string;
  createdAt: number;
  attempts: number;
  state: 'pending' | 'sent' | 'failed';
  lastError: string | null;
  sentAt: number | null;
}

export interface CachedMenu {
  rev: number;
  categories: any[];
  products: any[];
  updatedAt: number;
}

// In-memory fallback for Web / testing environments
class MemoryDb {
  private outbox: OutboxRow[] = [];
  private menuCache: CachedMenu | null = null;
  private tablesCache: any = null;
  private nextId = 1;

  async init() {}

  async insertOutbox(order: Omit<OutboxRow, 'id' | 'attempts' | 'state' | 'lastError' | 'sentAt'>): Promise<number> {
    const existing = this.outbox.find(o => o.clientOrderId === order.clientOrderId);
    if (existing) return existing.id;
    const row: OutboxRow = {
      ...order,
      id: this.nextId++,
      attempts: 0,
      state: 'pending',
      lastError: null,
      sentAt: null
    };
    this.outbox.unshift(row);
    return row.id;
  }

  async getPendingOutbox(): Promise<OutboxRow[]> {
    return this.outbox.filter(o => o.state === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  }

  async getAllOrders(limit = 50): Promise<OutboxRow[]> {
    return this.outbox.slice(0, limit);
  }

  async markOutboxSent(clientOrderId: string): Promise<void> {
    const item = this.outbox.find(o => o.clientOrderId === clientOrderId);
    if (item) {
      item.state = 'sent';
      item.sentAt = Date.now();
      item.lastError = null;
    }
  }

  async markOutboxFailed(clientOrderId: string, error: string, permanent = false): Promise<void> {
    const item = this.outbox.find(o => o.clientOrderId === clientOrderId);
    if (item) {
      item.attempts++;
      item.lastError = error;
      if (permanent) {
        item.state = 'failed';
      }
    }
  }

  async saveMenu(rev: number, categories: any[], products: any[]): Promise<void> {
    this.menuCache = { rev, categories, products, updatedAt: Date.now() };
  }

  async getMenu(): Promise<CachedMenu | null> {
    return this.menuCache;
  }

  async saveTables(shift: any, halls: any[], tables: any[]): Promise<void> {
    this.tablesCache = { shift, halls, tables, updatedAt: Date.now() };
  }

  async getTables(): Promise<any | null> {
    return this.tablesCache;
  }

  async cleanOldOrders(daysToKeep = 7): Promise<void> {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    this.outbox = this.outbox.filter(o => o.state === 'pending' || (o.sentAt && o.sentAt > cutoff));
  }
}

let nativeDbInstance: any = null;
const memDb = new MemoryDb();

export async function getDb() {
  if (Platform.OS === 'web') {
    return memDb;
  }

  try {
    if (!nativeDbInstance) {
      const SQLite = require('expo-sqlite');
      const db = await SQLite.openDatabaseAsync('taqfeela_mobile.db');
      
      // Initialize schema
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          clientOrderId TEXT UNIQUE NOT NULL,
          tableId INTEGER NOT NULL,
          tableName TEXT NOT NULL,
          waiterId INTEGER NOT NULL,
          payloadJson TEXT NOT NULL,
          itemsSummary TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          attempts INTEGER DEFAULT 0,
          state TEXT DEFAULT 'pending',
          lastError TEXT,
          sentAt INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox(state);
        CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(createdAt);

        CREATE TABLE IF NOT EXISTS menu_cache (
          key TEXT PRIMARY KEY,
          rev INTEGER NOT NULL,
          categoriesJson TEXT NOT NULL,
          productsJson TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tables_cache (
          key TEXT PRIMARY KEY,
          shiftJson TEXT,
          hallsJson TEXT,
          tablesJson TEXT,
          updatedAt INTEGER NOT NULL
        );
      `);

      nativeDbInstance = {
        async insertOutbox(order: Omit<OutboxRow, 'id' | 'attempts' | 'state' | 'lastError' | 'sentAt'>): Promise<number> {
          const res = await db.runAsync(
            `INSERT OR IGNORE INTO outbox (clientOrderId, tableId, tableName, waiterId, payloadJson, itemsSummary, createdAt, attempts, state)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
            [order.clientOrderId, order.tableId, order.tableName, order.waiterId, order.payloadJson, order.itemsSummary, order.createdAt]
          );
          return res.lastInsertRowId;
        },

        async getPendingOutbox(): Promise<OutboxRow[]> {
          return await db.getAllAsync(
            `SELECT * FROM outbox WHERE state = 'pending' ORDER BY createdAt ASC`
          );
        },

        async getAllOrders(limit = 50): Promise<OutboxRow[]> {
          return await db.getAllAsync(
            `SELECT * FROM outbox ORDER BY createdAt DESC LIMIT ?`,
            [limit]
          );
        },

        async markOutboxSent(clientOrderId: string): Promise<void> {
          await db.runAsync(
            `UPDATE outbox SET state = 'sent', sentAt = ?, lastError = NULL WHERE clientOrderId = ?`,
            [Date.now(), clientOrderId]
          );
        },

        async markOutboxFailed(clientOrderId: string, error: string, permanent = false): Promise<void> {
          const nextState = permanent ? 'failed' : 'pending';
          await db.runAsync(
            `UPDATE outbox SET attempts = attempts + 1, lastError = ?, state = ? WHERE clientOrderId = ?`,
            [error, nextState, clientOrderId]
          );
        },

        async saveMenu(rev: number, categories: any[], products: any[]): Promise<void> {
          await db.runAsync(
            `INSERT OR REPLACE INTO menu_cache (key, rev, categoriesJson, productsJson, updatedAt)
             VALUES ('main', ?, ?, ?, ?)`,
            [rev, JSON.stringify(categories), JSON.stringify(products), Date.now()]
          );
        },

        async getMenu(): Promise<CachedMenu | null> {
          const row: any = await db.getFirstAsync(`SELECT * FROM menu_cache WHERE key = 'main'`);
          if (!row) return null;
          return {
            rev: row.rev,
            categories: JSON.parse(row.categoriesJson || '[]'),
            products: JSON.parse(row.productsJson || '[]'),
            updatedAt: row.updatedAt
          };
        },

        async saveTables(shift: any, halls: any[], tables: any[]): Promise<void> {
          await db.runAsync(
            `INSERT OR REPLACE INTO tables_cache (key, shiftJson, hallsJson, tablesJson, updatedAt)
             VALUES ('main', ?, ?, ?, ?)`,
            [JSON.stringify(shift), JSON.stringify(halls), JSON.stringify(tables), Date.now()]
          );
        },

        async getTables(): Promise<any | null> {
          const row: any = await db.getFirstAsync(`SELECT * FROM tables_cache WHERE key = 'main'`);
          if (!row) return null;
          return {
            shift: JSON.parse(row.shiftJson || '{}'),
            halls: JSON.parse(row.hallsJson || '[]'),
            tables: JSON.parse(row.tablesJson || '[]'),
            updatedAt: row.updatedAt
          };
        },

        async cleanOldOrders(daysToKeep = 7): Promise<void> {
          const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
          await db.runAsync(
            `DELETE FROM outbox WHERE state = 'sent' AND sentAt < ?`,
            [cutoff]
          );
        }
      };
    }
    return nativeDbInstance;
  } catch (err) {
    console.warn('Falling back to in-memory database:', err);
    return memDb;
  }
}
