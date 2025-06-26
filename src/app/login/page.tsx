import { globalGETRateLimit } from "@/lib/server/request";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";

export default async function Page() {
    if (!(await globalGETRateLimit())) {
		return "Too many requests"
	}
    const { user } = await getCurrentSession();
	if (user !== null) {
		return redirect("/");
	}
	return (
		<>	
			<h1 className="text-3xl font-bold text-center pt-20">[login]</h1>
			<a href="/login/github">Sign in with GitHub</a>
		</>
	);
}
