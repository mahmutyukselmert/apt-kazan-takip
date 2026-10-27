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
    label: text("label").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("tariffs_user_date_idx").on(table.userId, table.effectiveFrom),
    uniqueIndex("tariffs_user_exact_date_idx").on(table.userId, table.effectiveFrom),
  ],
);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey(),
  buildingName: text("building_name").notNull().default("Apartmanımız"),
  apartmentCount: integer("apartment_count").notNull().default(20),
  krdAlert: real("krd_alert").notNull().default(300),
  city: text("city").notNull().default("Ankara"),
  updatedAt: text("updated_at").notNull(),
});
