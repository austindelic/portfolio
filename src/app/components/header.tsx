import Link from "next/link";

const Header = function Header() {
	return (
		<div className="h-[40px] flex items-center justify-between font-[900] mt-2">
			<Link href="/">
				<img
					src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/e096f8a3857a7dd609db312427b03b7b0a77db6f_asset_1.svg"
					alt="Logo"
					height="32"
					style={{ height: '32px', width: 'auto' }}
				/>
			</Link>
			<ul className="flex flex-row items-center gap-4">
				<li>
					<Link href="/" className="hover:underline font-black text-xl">[home]</Link>
				</li>
				<li>
					<Link href="/projects" className="hover:underline font-black text-xl">[projects]</Link>
				</li>
				<li>
					<Link href="/contact" className="hover:underline font-black text-xl">[contact]</Link>
				</li>
			</ul>
		</div>
	);
};

export default Header;