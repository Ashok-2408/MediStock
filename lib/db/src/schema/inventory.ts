import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  role: text("role").$type<"admin" | "customer" | "staff">().notNull(),
  fullName: text("full_name").notNull(),
  age: integer("age"),
  phone: text("phone").notNull().unique(),
  address: text("address"),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const phoneVerificationsTable = pgTable("phone_verifications", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appUsersTable = pgTable("app_users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  role: text("role").$type<"admin" | "staff">().notNull(),
  isFirstAdmin: boolean("is_first_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const medicinesTable = pgTable("medicines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  batchNumber: text("batch_number"),
  quantity: integer("quantity").notNull().default(0),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" })
    .notNull()
    .default(0),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  supplier: text("supplier"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const activitiesTable = pgTable("activities", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  details: text("details").notNull(),
  medicineName: text("medicine_name"),
  quantity: integer("quantity"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  question: text("question").notNull(),
  status: text("status").notNull().default("received"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
