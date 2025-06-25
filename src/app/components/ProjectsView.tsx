import { fetchAllProjects } from "@/lib/db";
import ProjectCard from "./projectCard";

interface ProjectsViewProps {
	limit?: number;
}

export default async function ProjectsView({ limit = -1}: ProjectsViewProps) {
	const data: {
		project: {
			id: string;
			name: string;
			url: string;
			logoImage: string | null;
			headerImage: string | null;
			description: string;
		};
		technologies: { iconUrl: string }[];
	}[] = await fetchAllProjects();

	const displayData = limit === -1 ? data : data.slice(0, Math.max(0, limit));

	return (
		<ul className="flex flex-wrap justify-center gap-6">
			{displayData.map(({ project, technologies }) => (
				<li key={project.id}>
					<ProjectCard
						title={project.name}
						url={project.url}
						logoImage={project.logoImage || undefined}
						headerImage={project.headerImage || undefined}
						description={project.description || ""}
						technologyIcons={technologies.map(tech => tech.iconUrl) || []}
					/>
				</li>
			))}
		</ul>
	);


}