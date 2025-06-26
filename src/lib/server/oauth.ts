import { GitHub } from "arctic";

// TODO: Update redirect URI
export const github = new GitHub(
	process.env.GITHUB_CLIENT_ID ?? "",
	process.env.GITHUB_CLIENT_SECRET ?? "",
	"https://www.armandpm.com/login/github/callbacklogin/github/callback"
);
