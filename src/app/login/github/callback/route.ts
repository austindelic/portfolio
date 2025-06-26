import { github } from "@/lib/github";
import { cookies } from "next/headers";
import {
	generateSessionToken,
	generateSession,
	setSessionTokenCookie
} from "@/lib/session";

export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	const cookieStore = await cookies();
	const storedState = cookieStore.get("github_oauth_state")?.value;

	if (!code || !state || state !== storedState) {
		return new Response("Invalid state or code", { status: 400 });
	}

	let tokens;
	try {
		tokens = await github.validateAuthorizationCode(code);
	} catch {
		return new Response("Invalid code", { status: 400 });
	}

	const userResponse = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${tokens.accessToken()}`,
		}
	});

	const githubUser = await userResponse.json();

	const existingUser = await getUserFromGitHubId(githubUser.id);

	if (existingUser) {
		const token = generateSessionToken();
		const session = await createSession(token, existingUser.id);
		await setSessionTokenCookie(token, session.expiresAt);
		return Response.redirect("/", 302);
	}
}