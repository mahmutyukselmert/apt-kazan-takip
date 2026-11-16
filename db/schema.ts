import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readings = sqliteTable(
  "readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    readAt: text("read_at").notNull(),
    hrc: real("hrc").notNull(),
    krd: real("krd").notNull(),
    boilerTemp: real("boiler_temp"),
    outsideTemp: real("outside_temp"),
    boilerStatus: text("boiler_status").notNull().default("on"),
    unitPrice: real("unit_price").notNull().default(0),
    unitPriceTier2: real("unit_price_tier2").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("readings_user_date_idx").on(table.userId, table.readAt),
    uniqueIndex("readings_user_exact_date_idx").on(table.userId, table.readAt),
  ],
);

export const tariffs = sqliteTable(
  "tariffs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    pricePerM3: real("price_per_m3").notNull(),
    priceTier2: real("price_tier2").notNull().default(0),
    label: text("label").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("tariffs_user_date_idx").on(table.userId, table.effectiveFrom),
    uniqueIndex("tariffs_user_exact_date_idx").on(table.userId, table.effectiveFrom),
  ],
);

export const limitVersions = sqliteTable(
  "limit_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    perHomeLimit: real("per_home_limit").notNull(),
    sourceLabel: text("source_label").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("limit_versions_user_month_idx").on(table.userId, table.year, table.month, table.effectiveFrom),
    uniqueIndex("limit_versions_user_exact_idx").on(table.userId, table.effectiveFrom, table.year, table.month),
  ],
);

export const boilerSessions = sqliteTable(
  "boiler_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    startHrc: real("start_hrc").notNull(),
    startKrd: real("start_krd").notNull(),
    endHrc: real("end_hrc"),
    endKrd: real("end_krd"),
    targetTemp: real("target_temp"),
    outsideTemp: real("outside_temp"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("boiler_sessions_user_start_idx").on(table.userId, table.startedAt),
  ],
);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey(),
  buildingName: text("building_name").notNull().default("Apartmanımız"),
  apartmentCount: integer("apartment_count").notNull().default(20),
  krdAlert: real("krd_alert").notNull().default(300),
  city: text("city").notNull().default("Eti Mahallesi, Çankaya / Ankara"),
  updatedAt: text("updated_at").notNull(),
});
