import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as schema from "./schema";

const { Pool } = pg;

export * from "./schema";

// Helper password hash for default seed admin
function getSeedHash(): string {
  const salt = "a1b2c3d4e5f60718";
  const hash = crypto.scryptSync("Admin@123", salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_ADMIN = {
  id: 1,
  role: "admin" as const,
  fullName: "Pharmacy Administrator",
  email: "admin@medistock.com",
  phone: "9876543210",
  age: 35,
  address: "Central Pharmacy Dept, Medical Complex",
  passwordHash: getSeedHash(),
  isPhoneVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEFAULT_MEDICINES = [
  {
    id: 1,
    name: "Paracetamol 500mg",
    category: "Analgesics",
    batchNumber: "PCM-2024-01",
    quantity: 120,
    unitPrice: 2.5,
    expiryDate: "2027-05-15",
    supplier: "Apex Healthcare",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    name: "Amoxicillin 250mg",
    category: "Antibiotics",
    batchNumber: "AMX-8821",
    quantity: 45,
    unitPrice: 8.75,
    expiryDate: "2026-11-20",
    supplier: "Biochem Pharma",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    name: "Cetirizine 10mg",
    category: "Antihistamine",
    batchNumber: "CTZ-9011",
    quantity: 8,
    unitPrice: 3.2,
    expiryDate: "2026-12-10",
    supplier: "Sunlight Labs",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 4,
    name: "Metformin 500mg",
    category: "Antidiabetic",
    batchNumber: "MET-4410",
    quantity: 210,
    unitPrice: 4.5,
    expiryDate: "2027-08-30",
    supplier: "Global Meds",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 5,
    name: "Azithromycin 500mg",
    category: "Antibiotics",
    batchNumber: "AZM-3301",
    quantity: 5,
    unitPrice: 15.0,
    expiryDate: "2026-10-30",
    supplier: "Apex Healthcare",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 6,
    name: "Pantoprazole 40mg",
    category: "Antacids",
    batchNumber: "PAN-5512",
    quantity: 80,
    unitPrice: 6.0,
    expiryDate: "2026-09-15", // expired for testing alerts
    supplier: "MedLife Care",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let poolInstance: any = null;
let pgDbInstance: any = null;

if (process.env.DATABASE_URL) {
  try {
    poolInstance = new Pool({ connectionString: process.env.DATABASE_URL });
    pgDbInstance = drizzle(poolInstance, { schema });

    // Initialize tables in Postgres asynchronously
    (async () => {
      try {
        const client = await poolInstance.connect();
        try {
          await client.query(`
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              role TEXT NOT NULL DEFAULT 'customer',
              full_name TEXT NOT NULL,
              email TEXT,
              phone TEXT,
              age INTEGER,
              address TEXT,
              password_hash TEXT NOT NULL,
              is_phone_verified BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS phone_verifications (
              id SERIAL PRIMARY KEY,
              phone TEXT NOT NULL,
              code TEXT NOT NULL,
              expires_at TIMESTAMPTZ NOT NULL,
              verified BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS app_users (
              clerk_user_id TEXT PRIMARY KEY,
              role TEXT NOT NULL,
              is_first_admin BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS medicines (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              category TEXT,
              batch_number TEXT,
              quantity INTEGER NOT NULL DEFAULT 0,
              unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
              expiry_date DATE NOT NULL,
              supplier TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS activities (
              id SERIAL PRIMARY KEY,
              action TEXT NOT NULL,
              details TEXT NOT NULL,
              medicine_name TEXT,
              quantity INTEGER,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS feedback (
              id SERIAL PRIMARY KEY,
              user_id TEXT NOT NULL,
              rating INTEGER NOT NULL,
              comment TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS questions (
              id SERIAL PRIMARY KEY,
              user_id TEXT NOT NULL,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              question TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'received',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);

          // Seed default admin if none exists
          const res = await client.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
          if (parseInt(res.rows[0].count) === 0) {
            await client.query(
              `INSERT INTO users (role, full_name, email, phone, age, address, password_hash, is_phone_verified)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT DO NOTHING`,
              [
                DEFAULT_ADMIN.role,
                DEFAULT_ADMIN.fullName,
                DEFAULT_ADMIN.email,
                DEFAULT_ADMIN.phone,
                DEFAULT_ADMIN.age,
                DEFAULT_ADMIN.address,
                DEFAULT_ADMIN.passwordHash,
                DEFAULT_ADMIN.isPhoneVerified,
              ],
            );
          }
        } finally {
          client.release();
        }
      } catch (err) {
        console.warn("PostgreSQL connection notice (using fallback storage if unavailable):", err);
      }
    })();
  } catch (err) {
    console.warn("Could not initialize PostgreSQL pool:", err);
  }
}

// ==========================================
// Embedded Resilient Storage Engine
// ==========================================
class MemoryStore {
  data: {
    users: any[];
    phone_verifications: any[];
    medicines: any[];
    activities: any[];
    feedback: any[];
    questions: any[];
    app_users: any[];
  };
  filePath: string;

  constructor() {
    this.filePath = path.resolve(process.cwd(), "medistock_data.json");
    this.data = {
      users: [DEFAULT_ADMIN],
      phone_verifications: [],
      medicines: [...DEFAULT_MEDICINES],
      activities: [
        {
          id: 1,
          action: "system_init",
          details: "Medistock inventory system initialized",
          createdAt: new Date(),
        },
      ],
      feedback: [],
      questions: [],
      app_users: [],
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
        };
        // Ensure default admin exists
        if (!this.data.users.some((u) => u.role === "admin")) {
          this.data.users.push(DEFAULT_ADMIN);
        }
      }
    } catch {
      // Ignore load error
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch {
      // Ignore save error
    }
  }

  getTable(tableName: string): any[] {
    const key = tableName.toLowerCase();
    if (key.includes("user") && !key.includes("app")) return this.data.users;
    if (key.includes("phone")) return this.data.phone_verifications;
    if (key.includes("medicine")) return this.data.medicines;
    if (key.includes("activit")) return this.data.activities;
    if (key.includes("feed")) return this.data.feedback;
    if (key.includes("quest")) return this.data.questions;
    if (key.includes("app_user")) return this.data.app_users;
    return [];
  }
}

const memoryStore = new MemoryStore();

function extractTableName(table: any): string {
  if (typeof table === "string") return table;
  if (table && table._ && table._.name) return table._.name;
  if (table && table[Symbol.for("drizzle:Name")]) return table[Symbol.for("drizzle:Name")];
  return "table";
}

function getStringChunkText(chunk: any): string | null {
  if (chunk?.constructor?.name !== "StringChunk" || !Array.isArray(chunk.value)) {
    return null;
  }
  return chunk.value.join("");
}

function getColumnPropertyName(column: any): string | undefined {
  const table = column?.table;
  return (
    (table && Object.keys(table).find((key) => table[key] === column)) ||
    column?.name ||
    column?._?.name
  );
}

function compareValues(left: any, right: any): number {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (left instanceof Date || right instanceof Date) {
    return new Date(leftValue).getTime() - new Date(rightValue).getTime();
  }

  return String(leftValue).localeCompare(String(rightValue));
}

function evaluateComparison(item: any, column: any, operator: string, parameter: any): boolean {
  const columnName = getColumnPropertyName(column);
  if (!columnName || item[columnName] === undefined) return false;

  const itemValue = item[columnName];
  const value = parameter && typeof parameter === "object" && "value" in parameter
    ? parameter.value
    : parameter;

  switch (operator.trim().toLowerCase()) {
    case "=":
      if (typeof itemValue === "string" && typeof value === "string") {
        return itemValue.toLowerCase() === value.toLowerCase();
      }
      return compareValues(itemValue, value) === 0;
    case "!=":
      return compareValues(itemValue, value) !== 0;
    case ">":
      return compareValues(itemValue, value) > 0;
    case ">=":
      return compareValues(itemValue, value) >= 0;
    case "<":
      return compareValues(itemValue, value) < 0;
    case "<=":
      return compareValues(itemValue, value) <= 0;
    case "ilike":
    case "like": {
      const pattern = String(value).replace(/%/g, ".*");
      return new RegExp(pattern, "i").test(String(itemValue || ""));
    }
    default:
      return true;
  }
}

function evaluatePredicate(item: any, predicate: any): boolean {
  if (!predicate) return true;
  if (typeof predicate === "function") return Boolean(predicate(item));

  if (Array.isArray(predicate.queryChunks)) {
    const chunks = predicate.queryChunks.filter((chunk: any) => {
      const text = getStringChunkText(chunk)?.trim();
      return text === null || (text !== "" && text !== "(" && text !== ")");
    });

    if (chunks.length === 1) {
      const text = getStringChunkText(chunks[0])?.trim().toLowerCase();
      if (text === "true") return true;
      if (text === "false") return false;
      return evaluatePredicate(item, chunks[0]);
    }

    if (chunks.length > 3 && chunks.length % 2 === 1) {
      const operators = chunks.filter((_chunk: any, index: number) => index % 2 === 1);
      const logicalOperators = operators.map((operator: any) =>
        getStringChunkText(operator)?.trim().toLowerCase(),
      );

      if (logicalOperators.every((operator: string | undefined) => operator === "and" || operator === "or")) {
        const groups: boolean[] = [];
        let groupResult = evaluatePredicate(item, chunks[0]);

        for (let index = 0; index < logicalOperators.length; index += 1) {
          const rightResult = evaluatePredicate(item, chunks[index * 2 + 2]);
          if (logicalOperators[index] === "and") {
            groupResult = groupResult && rightResult;
          } else {
            groups.push(groupResult);
            groupResult = rightResult;
          }
        }

        return groups.some(Boolean) || groupResult;
      }
    }

    if (chunks.length === 3) {
      const operator = getStringChunkText(chunks[1]);
      if (operator) {
        const normalizedOperator = operator.trim().toLowerCase();
        if (normalizedOperator === "and") {
          return evaluatePredicate(item, chunks[0]) && evaluatePredicate(item, chunks[2]);
        }
        if (normalizedOperator === "or") {
          return evaluatePredicate(item, chunks[0]) || evaluatePredicate(item, chunks[2]);
        }
        return evaluateComparison(item, chunks[0], operator, chunks[2]);
      }
    }
  }

  // eq operator in Drizzle:
  if (predicate.left && predicate.right !== undefined) {
    const colName = getColumnPropertyName(predicate.left) || Object.keys(item).find(k => k.toLowerCase() === String(predicate.left).toLowerCase());
    const val = predicate.right;
    if (colName && item[colName] !== undefined) {
      if (typeof item[colName] === "string" && typeof val === "string") {
        return item[colName].toLowerCase() === val.toLowerCase();
      }
      return item[colName] === val;
    }
  }

  // Drizzle expression with operator
  if (predicate.operator) {
    const op = predicate.operator;
    const colName = getColumnPropertyName(predicate.left);
    const val = predicate.right?.value !== undefined ? predicate.right.value : predicate.right;
    const itemVal = colName ? item[colName] : undefined;

    if (op === "=") return itemVal == val;
    if (op === "!=") return itemVal != val;
    if (op === ">") return Number(itemVal) > Number(val);
    if (op === ">=") return Number(itemVal) >= Number(val);
    if (op === "<") return Number(itemVal) < Number(val);
    if (op === "<=") return Number(itemVal) <= Number(val);
    if (op === "ilike" || op === "like") {
      const pattern = String(val).replace(/%/g, ".*");
      return new RegExp(pattern, "i").test(String(itemVal || ""));
    }
  }

  return true;
}

// Fallback DB Query Builder
function createFallbackDb() {
  return {
    select(selection?: any) {
      let selectedTable: string = "";
      let wherePredicate: any = null;
      let limitCount: number | null = null;
      let orderBySpec: any = null;

      const queryBuilder = {
        from(table: any) {
          selectedTable = extractTableName(table);
          return queryBuilder;
        },
        where(predicate: any) {
          wherePredicate = predicate;
          return queryBuilder;
        },
        orderBy(order: any) {
          orderBySpec = order;
          return queryBuilder;
        },
        limit(count: number) {
          limitCount = count;
          return queryBuilder;
        },
        for(_lock: string) {
          return queryBuilder;
        },
        then(resolve: any, reject?: any) {
          try {
            const tableData = memoryStore.getTable(selectedTable);
            let results = tableData.filter((item) => evaluatePredicate(item, wherePredicate));

            if (orderBySpec) {
              results = [...results].reverse();
            }

            if (limitCount !== null) {
              results = results.slice(0, limitCount);
            }

            // Deep clone results
            const cloned = JSON.parse(JSON.stringify(results));
            return resolve(cloned);
          } catch (err) {
            if (reject) reject(err);
            else throw err;
          }
        },
      };

      return queryBuilder;
    },

    insert(table: any) {
      const tableName = extractTableName(table);
      let valuesToInsert: any = null;

      const insertBuilder = {
        values(values: any) {
          valuesToInsert = values;
          return insertBuilder;
        },
        returning() {
          return {
            then(resolve: any) {
              const tableData = memoryStore.getTable(tableName);
              const items = Array.isArray(valuesToInsert) ? valuesToInsert : [valuesToInsert];
              const createdItems: any[] = [];

              for (const it of items) {
                const nextId = tableData.length > 0 ? Math.max(...tableData.map((d) => Number(d.id || 0))) + 1 : 1;
                const newRecord = {
                  id: nextId,
                  ...it,
                  createdAt: it.createdAt || new Date().toISOString(),
                  updatedAt: it.updatedAt || new Date().toISOString(),
                };
                tableData.push(newRecord);
                createdItems.push(newRecord);
              }

              memoryStore.save();
              return resolve(Array.isArray(valuesToInsert) ? createdItems : createdItems);
            },
          };
        },
        then(resolve: any) {
          const tableData = memoryStore.getTable(tableName);
          const items = Array.isArray(valuesToInsert) ? valuesToInsert : [valuesToInsert];
          for (const it of items) {
            const nextId = tableData.length > 0 ? Math.max(...tableData.map((d) => Number(d.id || 0))) + 1 : 1;
            tableData.push({
              id: nextId,
              ...it,
              createdAt: it.createdAt || new Date().toISOString(),
              updatedAt: it.updatedAt || new Date().toISOString(),
            });
          }
          memoryStore.save();
          return resolve({ rowCount: items.length });
        },
      };

      return insertBuilder;
    },

    update(table: any) {
      const tableName = extractTableName(table);
      let updateValues: any = {};
      let wherePredicate: any = null;

      const updateBuilder = {
        set(values: any) {
          updateValues = values;
          return updateBuilder;
        },
        where(predicate: any) {
          wherePredicate = predicate;
          return updateBuilder;
        },
        returning() {
          return {
            then(resolve: any) {
              const tableData = memoryStore.getTable(tableName);
              const updatedItems: any[] = [];

              for (let i = 0; i < tableData.length; i++) {
                if (evaluatePredicate(tableData[i], wherePredicate)) {
                  tableData[i] = {
                    ...tableData[i],
                    ...updateValues,
                    updatedAt: new Date().toISOString(),
                  };
                  updatedItems.push(tableData[i]);
                }
              }

              memoryStore.save();
              return resolve(updatedItems);
            },
          };
        },
        then(resolve: any) {
          const tableData = memoryStore.getTable(tableName);
          for (let i = 0; i < tableData.length; i++) {
            if (evaluatePredicate(tableData[i], wherePredicate)) {
              tableData[i] = {
                ...tableData[i],
                ...updateValues,
                updatedAt: new Date().toISOString(),
              };
            }
          }
          memoryStore.save();
          return resolve({ rowCount: 1 });
        },
      };

      return updateBuilder;
    },

    delete(table: any) {
      const tableName = extractTableName(table);
      let wherePredicate: any = null;

      const deleteBuilder = {
        where(predicate: any) {
          wherePredicate = predicate;
          return deleteBuilder;
        },
        returning() {
          return {
            then(resolve: any) {
              const tableData = memoryStore.getTable(tableName);
              const deleted: any[] = [];
              const kept: any[] = [];

              for (const it of tableData) {
                if (evaluatePredicate(it, wherePredicate)) {
                  deleted.push(it);
                } else {
                  kept.push(it);
                }
              }

              // Replace items in tableData
              tableData.length = 0;
              tableData.push(...kept);
              memoryStore.save();
              return resolve(deleted);
            },
          };
        },
        then(resolve: any) {
          const tableData = memoryStore.getTable(tableName);
          const kept = tableData.filter((it) => !evaluatePredicate(it, wherePredicate));
          tableData.length = 0;
          tableData.push(...kept);
          memoryStore.save();
          return resolve({ rowCount: 1 });
        },
      };

      return deleteBuilder;
    },

    async transaction(callback: (tx: any) => Promise<any>) {
      // In fallback mode, run callback with this fallback DB instance
      return callback(this);
    },

    async execute(query: any) {
      return { rows: [] };
    },
  };
}

const fallbackDb = createFallbackDb();

// Main DB export: Uses PostgreSQL if DATABASE_URL is present, otherwise resilient fallback
export const pool = poolInstance || {
  query: async () => ({ rows: [] }),
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
};

export const db: any = pgDbInstance || fallbackDb;
