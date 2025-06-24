import { fetch_project_by_slug } from '@/lib/db';
import { fetchReadmeFromRepo } from '@/lib/github';
import { mdToCleanHtml } from '@/lib/markdown';


export default async function PostPage({params: {slug}}: {params: {slug: string}}) {
	try {
		const project = await fetch_project_by_slug(slug);
		const url = project.url;
		const readme = await fetchReadmeFromRepo(url); 
		const { clean_html } = await mdToCleanHtml(readme);
		console.log('Project:', project);
		console.log('README:', readme);
		return (
			<div dangerouslySetInnerHTML={{ __html: clean_html || ''}} />
		);
	}
	catch (error) {
		console.error('Error fetching project or README:', error);
		return <div>Error loading project details.</div>;
	}
}
