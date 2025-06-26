import GreetingCard from "./components/greetingCard";
import ProjectsView from "./components/ProjectsView";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";
import { LogoutButton } from "./components";
import { globalGETRateLimit } from "@/lib/server/request";

export default async function Home() {
  if (!globalGETRateLimit()) {
    return "Too many requests";
  }
  const { user } = getCurrentSession();
  if (user === null) {
    return redirect("/login");
  }
  const image = `https://avatars.githubusercontent.com/u/${user.githubId}`;

  return (
    <div className="flex flex-col items-center gap-12">
      <GreetingCard />
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-row gap-4 w-full justify-between items-center px-4">
          <h4 className="text-xl font-black">[projects]</h4>
          <a href="/projects" className="hover:underline font-black text-xl">[view all]</a>
        </div>
        <ProjectsView limit={4}/>
      </div>
      <div className="flex flex-col items-center gap-4">
        <h1>Hi, {user.username}!</h1>
        <img src={image} height="100px" width="100px" alt="profile" />
        <p>Email: {user.email}</p>
        <LogoutButton />
      </div>
    </div>
  );
}
