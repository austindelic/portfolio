import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users
export const users = pgTable("User", {
  id: uuid("id").primaryKey(),
  username: varchar("username", { length: 255 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  githubId: integer("githubId").unique().notNull(),
});

// Sessions
export const sessions = pgTable(
  "Session",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("userId").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIndex: index("Session_userId_index").on(table.userId),
  })
);

// Projects
export const projects = pgTable("Project", {
  id: uuid("id").notNull().defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  url: text("url"),
  logoImage: text("logoImage"),
  headerImage: text("headerImage"),
});

// Technologies
export const technologies = pgTable("Technology", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  iconUrl: text("iconUrl"),
});

// ProjectTechnology (Many-to-Many)
export const projectTechnologies = pgTable(
  "ProjectTechnology",
  {
    projectId: uuid("projectId").notNull(),
    technologyId: uuid("technologyId").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.technologyId] }),
  })
);

// Relations
export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const projectRelations = relations(projects, ({ many }) => ({
  techLinks: many(projectTechnologies),
}));

export const technologyRelations = relations(technologies, ({ many }) => ({
  projects: many(projectTechnologies),
}));

export const projectTechnologyRelations = relations(projectTechnologies, ({ one }) => ({
  project: one(projects, {
    fields: [projectTechnologies.projectId],
    references: [projects.id],
  }),
  technology: one(technologies, {
    fields: [projectTechnologies.technologyId],
    references: [technologies.id],
  }),
}));