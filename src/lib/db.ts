"use server"
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projects, projectTechnologies, technologies } from '../db/schema';
import { UUID } from 'crypto';

export async function fetchAllProjects(){
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);
  try {
    const allProjectsWithTech = await db
    .select({
      project: projects,
      technologies: technologies
    })
    .from(projects)
    .leftJoin(projectTechnologies, eq(projectTechnologies.projectId, projects.id))
    .leftJoin(technologies, eq(technologies.id, projectTechnologies.technologyId));

  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function fetchTechnologiesByProjectId(projectId: UUID) {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  const technologiesForProject = await db
    .select()
    .from(projectTechnologies)
    .where(eq(projectTechnologies.projectId, projectId))
    .leftJoin(technologies, eq(technologies.id, projectTechnologies.technologyId));
  
  return technologiesForProject;
}