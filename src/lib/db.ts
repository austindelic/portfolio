"use server"
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projects } from '../db/schema';

export async function fetch_all_projects(){
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  try {
    const allLinks = await db.select().from(projects);
    return allLinks;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function fetch_project_by_slug(slug: string) {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  try {
    const result = await db.select().from(projects).where(eq(projects.slug, slug ));
    return result[0];
  } catch (error) {
    console.error(error);
    throw error;
  }
}