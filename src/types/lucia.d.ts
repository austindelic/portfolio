
import "lucia";                           // make this file a module
import type { User as PrismaUser } from "@prisma/client";

declare module "lucia" {
  interface Register {
    User: PrismaUser;                     // now Lucia.User == PrismaUser
  }
}