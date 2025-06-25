import { join } from 'path';
import React from 'react';

interface ProjectCardProps {
  title: string;
  url: string;
  logoImage?: string;
  description?: string;
  headerImage?: string;
  technologyIcons?: string[];
}

const ProjectCard: React.FC<ProjectCardProps> = ({ title, url, logoImage, description = "", headerImage, technologyIcons}) => {
  return (
<a href={url} style={{
	display: 'inline-block',
	textDecoration: 'none', 
	color: 'inherit',
	width: '330px',
	height: '270px',
	borderRadius: '20px',
	overflow: 'hidden',
	boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
	fontFamily: 'sans-serif',
	backgroundColor: '#fff'
	}}>
	<div style={{
	
	}}>
	{/* Header */}
	<div style={{
		height: '110px',
		background: headerImage ? `url(${headerImage}) center/cover` : 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		position: 'relative'
	}}>
	{!logoImage ? (
		<div style={{
			width: '80px',
			height: '80px',
			backgroundColor: '#000',
			color: '#fff',
			borderRadius: '20px',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			fontSize: '40px',
			fontWeight: 'bold',
			position: 'absolute',
			bottom: '-40px',
			boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
			}}>
			{title[0].toUpperCase()}
		</div>
	) : (
		<img 
			src={logoImage} 
			alt={`${title} logo`} 
			style={{
				width: '80px',
				height: '80px',
				borderRadius: '20px',
				position: 'absolute',
				bottom: '-40px',
				objectFit: 'cover',
				boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
			}}
		/>
	)}
	</div>

	{/* Text Content */}
	<div style={{ padding: '60px 20px 20px 20px', textAlign: 'left' }}>
		<h2 style={{ margin: 0, fontSize: '1.5rem' }}>{title}</h2>
		<p style={{ marginTop: '10px', color: '#555', fontSize: '0.9rem' }}>
		{description}
		</p>
		{technologyIcons && technologyIcons.length > 0 && (
			<div style={{ display: 'flex', marginTop: '15px', gap: '10px', justifyContent: 'flex-start' }}>
				{technologyIcons.map((icon, index) => (
					<img 
						key={index} 
						src={icon}
						alt='technology icon'
						style={{ width: '24px', height: '24px' }}
					/>
				))}
			</div>
		)}
	</div>
	</div>
</a>
  );
};

export default ProjectCard;