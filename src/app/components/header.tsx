import Link from "next/link";

export default function () {
	return (
		<div className="border-black/10 border-b h-[40px] flex items-center justify-between px-4">
			<div>logo</div>
			<ul className="Headerflex items-center gap-4">
				<li>
					<Link href="/">Home</Link>
				</li>
				<li>
					<Link href="/posts">Posts</Link>
				</li>
			</ul>
		</div>
	);
}