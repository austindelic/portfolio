import { fetch_example } from "@/lib";
import { UUID } from "crypto";
import ProjectCard from "../components/projectCard";

export default async function page() {
	const data = await fetch_example()
	
	return (
		<div className="text-center pt-20">
			<h1 className="text-3xl font-bold">Posts</h1>
			<ul>
				{data.map((project: { id: string; name: string | null; url: string | null }) => (
					<li key={project.id}>
						<a href={project.url || "#"} target="_blank" rel="noopener noreferrer">
							{project.name || "Unnamed Project"}
							<ProjectCard title={project.name || "Unnamed Project"} description="This is a demo description." />
						</a>
					</li>
				))}
			</ul>
		</div>
		
	);
}