import { fetch_all_projects } from "@/lib/db";
import { UUID } from "crypto";
import ProjectCard from "../components/projectCard";

export default async function page() {
	const data = await fetch_all_projects()
	
	return (
		<div className="text-center pt-20">
			<h1 className="text-3xl font-bold">Posts</h1>
			<ul className="flex flex-wrap justify-center gap-6 p-6">
				{data.map((project: { id: string; name: string; url: string; slug: string; logoImage: string | null; headerImage: string | null; description: string }) => (
					<li key={project.id}>
						<ProjectCard 
						title={project.name} 
						slug={project.slug}
						url={project.url}
						logoImage={project.logoImage || undefined}
						headerImage={project.headerImage || undefined}
						description= {project.description || ""}
						/>
					</li>
				))}
			</ul>
		</div>
		
	);
}