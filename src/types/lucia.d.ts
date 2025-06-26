/// <reference types="lucia" />

import type { User as PrismaUser } from "@prisma/client";

declare module "lucia" {
  interface Register {
    User: PrismaUser;
  }
}