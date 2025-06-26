const ADMIN_IDS = process.env.ADMIN_GITHUB_IDS?.split(",").map(id => Number(id)) || [];

export function isAdmin(user: { githubId: number }) {
	return ADMIN_IDS.includes(user.githubId);
}