import { fetchAllProjects } from "@/lib/db";
import ProjectsView from "../components/ProjectsView";

export default async function project() {
	//const data: { project: { id: string; name: string; url: string; logoImage: string | null; headerImage: string | null; description: string }; technologies: { iconUrl: string }[] }[] = await fetchAllProjects();
	
	return (
		<div className="text-center pt-20 gap-6 flex flex-col items-center">
			<h1 className="text-3xl font-bold">[projects]</h1>
			<ProjectsView/>
		</div>
		
	);
}