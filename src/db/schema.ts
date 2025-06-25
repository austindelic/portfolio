import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const projects = pgTable("links", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 1024 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  logoImage: varchar("logo_image", { length: 2048 }),
  headerImage: varchar("header_image", { length: 2048 }),
});
