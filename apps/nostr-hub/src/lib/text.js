import { marked } from 'marked';

export function chaptersFromMarkdown(text) {
  const sections = [];
  let part = { id: '1', title: 'Start', text: '' };
  for (const token of marked.lexer(text)) {
    if (token.type === 'heading' && token.depth <= 2) {
      if (part.text.trim()) sections.push(part);
      part = { id: String(sections.length + 1), title: token.text, text: '' };
    } else part.text += token.raw ?? '';
  }
  if (part.text.trim() || !sections.length) sections.push(part);
  return sections;
}
