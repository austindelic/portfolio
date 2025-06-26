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
<a href={url} className="border-2 border-black" style={{
	display: 'inline-block',
	textDecoration: 'none', 
	color: 'inherit',
	width: '356px',
	height: '319px',
	borderRadius: '0',
	overflow: 'hidden',
	fontFamily: 'sans-serif',
	backgroundColor: '#fff',
	}}>
	<div style={{
	
	}}>
	{/* Header */}
	<div style={{
		paddingTop: '40%',
		background: headerImage ? `url(${headerImage}) center/cover` : 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		position: 'relative',
	}}>
	{logoImage && (
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
	<div style={{
		padding: logoImage ? '45px 20px 20px 20px' : '20px',
		textAlign: 'left',
		display: 'flex',
		flexDirection: 'column',
		gap: '8px',
	}}>
		<h2 style={{ margin: 0, fontSize: '1.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
		<div style={{display: 'flex', flexDirection: 'column'}}>
			<p style={{
				marginTop: '5px',
				color: '#555',
				fontSize: '1.1rem',
				display: '-webkit-box',
				WebkitLineClamp: 2,
				WebkitBoxOrient: 'vertical',
				overflow: 'hidden',
			}}>
				{description}
			</p>
			{technologyIcons && technologyIcons.length > 0 && (
				<div style={{ display: 'flex', justifyContent: 'flex-start' }}>
					{technologyIcons.map((icon, index) => (
						<img 
							key={index} 
							src={icon}
							alt='technology icon'
							style={{ width: '24px', height: '24px',  marginTop: '10px', overflow: 'hidden', textOverflow: 'ellipsis'}}
						/>
					))}
				</div>
			)}
		</div>
	</div>
	</div>
</a>
  );
};

export default ProjectCard;