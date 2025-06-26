import { db } from "./db";

export async function createUser(
	githubId: number,
	email: string,
	username: string
) {
	return db.user.create({
		data: {
			githubId,
			email,
			username
		}
	});
}

export async function getUserFromGitHubId(githubId: number) {
	return db.user.findUnique({
		where: { githubId }
	});
}
