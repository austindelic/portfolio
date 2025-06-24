import { renderHtmlSync } from 'cmark-gfm';
import sanitizeHtml from 'sanitize-html';
import { JSDOM } from 'jsdom';
import hljs from 'highlight.js';
import { marked } from 'marked';


export function cleanHtml(dirty_html: string | null): { clean_html: string | null } {
	//safe for client and server side sanitization
	let clean_html: string | null = null;
	if (!dirty_html) {
		return { clean_html };
	}
	clean_html = sanitizeHtml(dirty_html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'pre', 'code', 'span']),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			a: ['href', 'name', 'target', 'rel'],
			img: ['src', 'alt', 'title', 'width', 'height'],
			code: ['class'],
			pre: ['class'],
			span: ['class']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesByTag: {
			img: ['http', 'https'],
			a: ['http', 'https', 'mailto']
		},
		allowProtocolRelative: false,
		transformTags: {
			a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
		}
	});
	return { clean_html };
}

export async function mdToHtml(md: string | null): Promise<{ html: string | null }> {
  let html: string | null = null;
  if (!md) return { html };

  html = await marked(md, {
    gfm: true,
    breaks: true
  });

  return { html };
}

export async function mdToCleanHtml(md: string | null): Promise<{ clean_html: string | null }> {
	const { html } = await mdToHtml(md);
	const { clean_html } = cleanHtml(html);
	return { clean_html };
}