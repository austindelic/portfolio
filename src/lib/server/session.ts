import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";

import { cache } from "react";

import { Lucia, TimeSpan } from "lucia";
import type { Session as LuciaSession, User as LuciaUser } from "lucia";
import { cookies } from "next/headers";

import { sessions, users } from "@/db/schema"; 

import { db } from "@/lib/db"; 

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
export const lucia = new Lucia(adapter, {
  sessionCookie: {	
    name: "session",
    attributes: {
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    },
  },
  sessionExpiresIn: new TimeSpan(30, "d"),
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