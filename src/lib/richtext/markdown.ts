/** Markdown import and export for the rich text editor (portability and AI drafts). */
import type { RtMark, RtNode } from './render';

function inlineToNodes(text: string): RtNode[] {
  const out: RtNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    const marks: RtMark[] = [];
    let value = '';
    if (m[2]) [value, marks[0]] = [m[2], { type: 'bold' }];
    else if (m[3]) [value, marks[0]] = [m[3], { type: 'italic' }];
    else if (m[4]) [value, marks[0]] = [m[4], { type: 'code' }];
    else if (m[5]) [value, marks[0]] = [m[5], { type: 'link', attrs: { href: m[6] } }];
    out.push({ type: 'text', text: value, marks });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out.filter((n) => n.text);
}

export function markdownToDoc(md: string): RtNode {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const content: RtNode[] = [];
  let para: string[] = [];
  let list: RtNode | null = null;
  let code: string[] | null = null;
  const flush = () => {
    if (para.length) content.push({ type: 'paragraph', content: inlineToNodes(para.join(' ')) });
    para = [];
  };
  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) {
        content.push({ type: 'codeBlock', content: code.length ? [{ type: 'text', text: code.join('\n') }] : [] });
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) {
      flush();
      list = null;
      code = [];
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
      list = null;
    } else if (h) {
      flush();
      list = null;
      content.push({ type: 'heading', attrs: { level: Math.max(2, (h[1] as string).length) }, content: inlineToNodes(h[2] as string) });
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      list = null;
      content.push({ type: 'horizontalRule' });
    } else if (ul || ol) {
      flush();
      const kind = ul ? 'bulletList' : 'orderedList';
      if (!list || list.type !== kind) {
        list = { type: kind, content: [] };
        content.push(list);
      }
      list.content?.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineToNodes(((ul ?? ol) as RegExpExecArray)[1] as string) }] });
    } else if (quote) {
      flush();
      list = null;
      content.push({ type: 'blockquote', content: [{ type: 'paragraph', content: inlineToNodes(quote[1] as string) }] });
    } else {
      list = null;
      para.push(line.trim());
    }
  }
  flush();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function inlineToMarkdown(nodes: RtNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      let t = n.text ?? '';
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') t = `**${t}**`;
        else if (m.type === 'italic') t = `*${t}*`;
        else if (m.type === 'code') t = `\`${t}\``;
        else if (m.type === 'link') t = `[${t}](${String(m.attrs?.href ?? '')})`;
      }
      return t;
    })
    .join('');
}

export function docToMarkdown(doc: RtNode): string {
  const block = (n: RtNode, indent = ''): string => {
    switch (n.type) {
      case 'heading':
        return `${'#'.repeat(Number(n.attrs?.level) || 2)} ${inlineToMarkdown(n.content)}`;
      case 'paragraph':
        return inlineToMarkdown(n.content);
      case 'bulletList':
      case 'orderedList':
        return (n.content ?? []).map((li, i) => `${indent}${n.type === 'bulletList' ? '-' : `${i + 1}.`} ${(li.content ?? []).map((c) => block(c, `${indent}  `)).join('\n')}`).join('\n');
      case 'blockquote':
        return (n.content ?? []).map((c) => `> ${block(c)}`).join('\n');
      case 'codeBlock':
        return `\`\`\`\n${(n.content ?? []).map((c) => c.text ?? '').join('')}\n\`\`\``;
      case 'horizontalRule':
        return '---';
      case 'image':
        return `![${String(n.attrs?.alt ?? '')}](${String(n.attrs?.src ?? '')})`;
      case 'callout':
        return (n.content ?? []).map((c) => `> ${block(c)}`).join('\n');
      case 'button':
        return `[${String(n.attrs?.label ?? 'Link')}](${String(n.attrs?.href ?? '')})`;
      case 'youtube':
        return String(n.attrs?.src ?? '');
      default:
        return (n.content ?? []).map((c) => block(c)).join('\n');
    }
  };
  return (doc.content ?? []).map((n) => block(n)).filter((s) => s !== '').join('\n\n') + '\n';
}
