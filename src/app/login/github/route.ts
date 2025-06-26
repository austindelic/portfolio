import { generateState } from "arctic";
import { github } from "@/lib/github";
import { cookies } from "next/headers";
import path from "path";

export async function GET(): Promise<Response> {
	const state = generateState();
	const url = github.createAuthorizationURL(state, []);

	const cookieStore = await cookies();
	cookieStore.set("github_oauth_state", state, {
		path: "/",	
		secure: process.env.NODE_ENV === "production",
		httpOnly: true,
		maxAge: 60 * 60, // 1 hour
		sameSite: "lax",
	});

	return new Response(null, {
		status: 302,
		headers: { Location: url.toString() }
	});
}