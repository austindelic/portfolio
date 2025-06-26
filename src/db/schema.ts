import { pgTable, uuid, varchar, primaryKey, timestamp } from "drizzle-orm/pg-core";
//import { use } from "react";

export const projects = pgTable("links", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 1024 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  logoImage: varchar("logo_image", { length: 2048 }),
  headerImage: varchar("header_image", { length: 2048 }),
});

export const technologies = pgTable("technologies", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  iconUrl: varchar("icon_url", { length: 2048 }).notNull(),
});

export const projectTechnologies = pgTable("project_technologies", {
  projectId: uuid("project_id").notNull().references(() => projects.id),
  technologyId: uuid("technology_id").notNull().references(() => technologies.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.technologyId] })
}));
//  
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  githubId: varchar("github_id", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  avatarUrl: varchar("avatar_url", { length: 2048 }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});