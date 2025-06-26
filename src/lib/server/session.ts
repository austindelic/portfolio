// src/lib/server/session.ts
import { cache } from "react";
import { Lucia, TimeSpan } from "lucia";
import { prisma as luciaPrismaAdapter } from "@lucia-auth/adapter-prisma";
import type { Session as LuciaSession, User as LuciaUser } from "lucia";
import { db } from "./db";
import { cookies } from "next/headers";

export const lucia = new Lucia(luciaPrismaAdapter(db), {
  sessionCookie: {
    name: "session",
    attributes: {
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    },
  },
  sessionExpiresIn: new TimeSpan(30, "d"), // 30 days
});

export type SessionValidationResult = {
	session: LuciaSession | null;
	user: LuciaUser | null;
};

export const getCurrentSession = cache(async (): Promise<SessionValidationResult> => {
	const cookieStore = await cookies();
	const token = cookieStore.get("session")?.value ?? null;
	if (!token) return { session: null, user: null };

	const result = await lucia.validateSession(token);
	if (!result.session) cookieStore.set("session", "", { path: "/", maxAge: 0 });
	return result;
});

export async function setSessionTokenCookie(token: string, expiresAt: Date): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set("session", token, {
		httpOnly: true,
		path: "/",
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		expires: expiresAt,
	});
}

export async function deleteSessionTokenCookie(): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set("session", "", {
		httpOnly: true,
		path: "/",
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 0,
	});
}