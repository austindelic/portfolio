import { fetch_project_by_slug } from '@/lib/db';
//import ReactMarkdown from 'react-markdown';


export default async function PostPage({params: {slug}}: {params: {slug: string}}) {
	const project = await fetch_project_by_slug(slug);
	if (!project) {
		return <div className="text-center pt-20">404: Project not found</div>;
	}

	return (
		<main className="prose mx-auto p-8">
			<h1>{project.name}</h1>
			<pre>{JSON.stringify(project, null, 2)}</pre>
		</main>
	)
}
