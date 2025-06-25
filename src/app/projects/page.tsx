import { fetchAllProjects } from "@/lib/db";
import ProjectCard from "../components/projectCard";
import { technologies } from "@/db/schema";

export default async function project() {
		const data: { project: { id: string; name: string; url: string; logoImage: string | null; headerImage: string | null; description: string }; technologies: { iconUrl: string }[] }[] = await fetchAllProjects();
	
	return (
		<div className="text-center pt-20">
			<h1 className="text-3xl font-bold">[projects]</h1>
			<ul className="flex flex-wrap justify-center gap-6">
				{data.map(({ project, technologies }) => (
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
		</div>
		
	);
}