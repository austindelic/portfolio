"use server"
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projects, projectTechnologies, technologies } from '../db/schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

export async function fetchAllProjects(){
  
  try {
    const allProjectsWithTech = await db
    .select({
      project: {
        id: projects.id,
        name: projects.name,
        description: projects.description,
        url: projects.url,
        logoImage: projects.logoImage,
        headerImage: projects.headerImage
      },
      technology: {
        id: technologies.id,
        name: technologies.name,
        slug: technologies.slug,
        iconUrl: technologies.iconUrl
      }
    })
    .from(projects)
    .leftJoin(projectTechnologies, eq(projectTechnologies.projectId, projects.id))
    .leftJoin(technologies, eq(technologies.id, projectTechnologies.technologyId));

    const projectMap = new Map<string, {project: typeof projects.$inferSelect, technologies: typeof technologies.$inferSelect[] }>();

    for (const row of allProjectsWithTech) {
      const id = row.project.id;
      if (!projectMap.has(id)) {
        projectMap.set(id, {
          project: row.project,
          technologies: row.technology ? [row.technology] : []
        });
      } else if (row.technology) {
        projectMap.get(id)!.technologies.push(row.technology);
      }
    }

    return Array.from(projectMap.values())
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// export async function fetchTechnologiesByProjectId(projectId: UUID) {
//   const client = postgres(process.env.DATABASE_URL!);
//   const db = drizzle(client);

//   const technologiesForProject = await db
//     .select()
//     .from(projectTechnologies)
//     .where(eq(projectTechnologies.projectId, projectId))
//     .leftJoin(technologies, eq(technologies.id, projectTechnologies.technologyId));
  
//   return technologiesForProject;
// }