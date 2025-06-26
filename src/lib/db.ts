"use server";

import { db } from "./server/db";


export async function fetchAllProjects() {
  return db.project.findMany({
    include: {
      techLinks: {
        select: {
          technology: {
            select: {
              id: true,
              name: true,
              iconUrl: true
            }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });
}