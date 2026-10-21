import 'server-only';
import sanitizeHtml from 'sanitize-html';

/**
 * Cleans owner HTML (custom HTML blocks and card templates). Allow-list only: no scripts, no event handlers,
 * no javascript: links, iframes only from known video and map hosts.
 */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'picture', 'source', 'video', 'iframe', 'svg', 'path', 'circle', 'rect', 'g', 'span', 'section', 'details', 'summary', 'button'],
    allowedAttributes: {
      '*': ['class', 'id', 'title', 'aria-label', 'aria-hidden', 'role', 'lang', 'dir', 'style'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding'],
      source: ['src', 'srcset', 'type', 'media'],
      video: ['src', 'controls', 'poster', 'muted', 'loop', 'playsinline', 'preload'],
      iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'title'],
      svg: ['viewBox', 'width', 'height', 'fill', 'stroke', 'xmlns'],
      path: ['d', 'fill', 'stroke', 'stroke-width'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke'],
      button: ['type'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com', 'www.google.com'],
    allowedStyles: { '*': { 'text-align': [/^(left|right|center)$/] } },
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  });
}

/** CSS for one block, scoped with native CSS nesting under the block's id. */
export function scopedCss(blockId: string, css: string): string {
  const clean = css.replace(/<\/?style/gi, '').replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '').replace(/url\(\s*['"]?\s*javascript:/gi, 'url(');
  return clean.trim() ? `#${blockId}{${clean}}` : '';
}
