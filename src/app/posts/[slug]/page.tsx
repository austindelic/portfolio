import { fetch_project_by_slug } from '@/lib/db';
import { fetchReadmeFromRepo } from '@/lib/github';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';


export default async function PostPage({params: {slug}}: {params: {slug: string}}) {
	try {
		const project = await fetch_project_by_slug(slug);
		const url = project.url;
		const readme = await fetchReadmeFromRepo(url);
		console.log('Project:', project);
		console.log('README:', readme);
		return (
			<div>
				<ReactMarkdown
					rehypePlugins={[rehypeRaw]}
					remarkPlugins={[remarkGfm]}
				>
					{readme}
				</ReactMarkdown>
			</div> 
		);
	}
	catch (error) {
		console.error('Error fetching project or README:', error);
		return <div>Error loading project details.</div>;
	}
}
