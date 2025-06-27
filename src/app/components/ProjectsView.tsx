import { fetchAllProjects } from "@/lib/db";
import ProjectCard from "./projectCard";

interface ProjectsViewProps {
	limit?: number;
}

export default async function ProjectsView({ limit = -1 }: ProjectsViewProps) {
	const rawProjects = await fetchAllProjects();

	// group projects with their tech links
	const projectsMap = new Map<string, {
		id: string;
		name: string;
		description: string | null;
		url: string | null;
		logoImage: string | null;
		headerImage: string | null;
		techLinks: string[];
	}>();

	rawProjects.forEach(({ project, technology }) => {
		const existing = projectsMap.get(project.id);
		if (existing) {
			if (technology?.iconUrl) existing.techLinks.push(technology.iconUrl);
		} else {
			projectsMap.set(project.id, {
				id: project.id,
				name: project.name,
				description: project.description,
				url: project.url,
				logoImage: project.logoImage,
				headerImage: project.headerImage,
				techLinks: technology?.iconUrl ? [technology.iconUrl] : [],
			});
		}
	});

	const groupedProjects = Array.from(projectsMap.values());
	const displayData =
		limit === -1
			? groupedProjects
			: groupedProjects.slice(0, Math.max(0, limit));

	return (
		<ul className="flex flex-wrap justify-center gap-6">
			{displayData.map((project) => (
				<li key={project.id}>
					<ProjectCard
						title={project.name}
						url={project.url ?? ""}
						logoImage={project.logoImage ?? undefined}
						headerImage={project.headerImage ?? undefined}
						description={project.description ?? ""}
						technologyIcons={project.techLinks}
					/>
				</li>
			))}
		</ul>
	);
}