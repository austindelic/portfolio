import Link from 'next/link';
import { getCurrentSession } from "@/lib/server/session";


export default async function Footer() {
	const { user } = await getCurrentSession();
	const isLoggedIn = !!user;


	return (
		<footer className="h-auto py-4 px-6 text-black font-[900] text-sm flex flex-col md:flex-row justify-between items-center gap-4">
			<div className="flex items-center gap-2 font-medium">
				<span>&copy; {new Date().getFullYear()} Armand Packham-McGuiness</span>
			</div>
			<ul className="flex flex-row items-center gap-6">
				<li>
					<Link href="/home" className="hover:underline font-medium">[home]</Link>
				</li>
				<li>
					<Link href="/projects" className="hover:underline font-medium">[projects]</Link>
				</li>
				<li>
					<Link href="/contact" className="hover:underline font-medium">[contact]</Link>
				</li>
				{isLoggedIn !== null && (
					<li>
						<Link href={isLoggedIn ? "/admin" : "/login"} className="hover:underline font-medium">[admin]</Link>
					</li>
				)}
			</ul>
		</footer>
	);
}