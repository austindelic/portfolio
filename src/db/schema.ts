import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const projects = pgTable("links", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  url: varchar("url", { length: 2048 }),
});
