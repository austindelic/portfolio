"use server"
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { projects } from '../db/schema';

export async function fetch_example(){
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  try {
    // await db.insert(projects).values({
    //   name: 'Drizzle ORM',
    //   url: 'https://orm.drizzle.team',
    // });

    const allLinks = await db.select().from(projects);
    return allLinks;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
