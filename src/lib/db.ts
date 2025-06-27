import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { eq } from "drizzle-orm";
import { projects, projectTechnologies, technologies } from "../db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

export async function fetchAllProjects() {
  return await db
    .select({
      project: {
        id: projects.id,
        name: projects.name,
        description: projects.description,
        url: projects.url,
        logoImage: projects.logoImage,
        headerImage: projects.headerImage,
      },
      technology: {
        id: technologies.id,
        name: technologies.name,
        slug: technologies.slug,
        iconUrl: technologies.iconUrl,
      },
    })
    .from(projects)
    .leftJoin(
      projectTechnologies,
      eq(projectTechnologies.projectId, projects.id)
    )
    .leftJoin(
      technologies,
      eq(technologies.id, projectTechnologies.technologyId)
    )
    .execute();
}