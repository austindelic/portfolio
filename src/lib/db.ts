"use server"
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { projects, projectTechnologies, technologies } from '../db/schema';
import { UUID } from 'crypto';

export async function fetchAllProjects(){
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