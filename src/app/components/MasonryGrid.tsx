"use client";

import Masonry from 'masonry-layout';
import { useEffect, useRef } from 'react';

export default function MasonryGrid({ children }: { children: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
	if (gridRef.current) {
		new Masonry(gridRef.current, {
			itemSelector: '.masonry-item',
			columnWidth: '.masonry-sizer',
			percentPosition: true,
		});
	}
  }, []);

  return (
	<div ref={gridRef} className="masonry-grid">
	  <div className="masonry-sizer w-full sm:w-1/2 md:w-1/3 lg:w-1/4"/>
	  {children}
	</div>
  );
}