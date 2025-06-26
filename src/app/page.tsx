import GreetingCard from "./components/greetingCard";
import ProjectsView from "./components/ProjectsView";
import { globalGETRateLimit } from "@/lib/server/request";

export default async function Home() {
  if (!(await globalGETRateLimit())) {
    return "Too many requests";
  }
  return (
    <div className="flex flex-col items-center gap-12">
      <GreetingCard />
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-row gap-4 w-full justify-between items-center px-4">
          <h4 className="text-xl font-black">[projects]</h4>
          <a href="/projects" className="hover:underline font-black text-xl">
            [view all]
          </a>
        </div>
        <ProjectsView limit={4} />
      </div>
    </div>
  );
}
