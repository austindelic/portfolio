export async function fetchReadmeFromRepo(url: string): Promise<string> {
	const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
	if (!match) throw new Error("Invalid GitHub repository URL");

	const [, owner, repo] = match;
	const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;

	const response = await fetch(rawUrl);
	if (!response.ok) throw new Error(`Failed to fetch README: ${response.statusText}`);
	return await response.text();
}