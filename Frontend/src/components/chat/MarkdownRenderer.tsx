import { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

// ── Inline formatting: bold, italic, inline-code ─────────────────────
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /`([^`\n]+)`|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    if (m[1])      parts.push(<code key={k++} className="px-1.5 py-0.5 rounded-md bg-muted text-foreground font-mono text-[85%] border border-border/30">{m[1]}</code>);
    else if (m[2]) parts.push(<strong key={k++} className="font-bold"><em>{m[2]}</em></strong>);
    else if (m[3]) parts.push(<strong key={k++} className="font-semibold">{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++} className="italic">{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

// ── Block renderer for a text segment ───────────────────────────────
function renderTextSegment(text: string, baseKey: number): ReactNode {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let k = baseKey;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Blank line → skip (surrounding blocks handle their own spacing)
    if (!t) { i++; continue; }

    // Headings
    const hm = t.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      const level = hm[1].length;
      const cls = [
        'text-xl font-bold mt-6 mb-2 first:mt-0 leading-tight',
        'text-lg font-bold mt-5 mb-1.5 first:mt-0 pb-1 border-b border-border/40 leading-tight',
        'text-base font-semibold mt-4 mb-1 first:mt-0 leading-tight',
        'text-sm font-semibold mt-3 mb-0.5 first:mt-0 text-muted-foreground leading-tight',
      ][level - 1];
      const Tag = (['h2', 'h3', 'h4', 'h4'] as const)[level - 1];
      elements.push(<Tag key={k++} className={cls}>{renderInline(hm[2])}</Tag>);
      i++; continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      elements.push(<hr key={k++} className="my-4 border-border/40" />);
      i++; continue;
    }

    // Markdown table — collect consecutive lines starting with "|"
    if (t.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) =>
          row.split('|').slice(1, -1).map(cell => cell.trim());
        const isSeparator = (row: string) => /^\|[\s\-:|\s]+\|$/.test(row);
        const headers = parseRow(tableLines[0]);
        const bodyRows = tableLines.slice(2).filter(l => !isSeparator(l)).map(parseRow);
        elements.push(
          <div key={k++} className="mt-3 first:mt-0 overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-4 py-2.5 text-left font-semibold text-foreground border-b border-border/40 whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 border-b border-border/20 text-muted-foreground leading-relaxed">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Blockquote — collect consecutive "> " lines
    if (t.startsWith('>')) {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || !lines[i].trim())) {
        if (lines[i].trim()) bqLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={k++} className="mt-3 pl-3 border-l-[3px] border-primary/40 italic text-muted-foreground space-y-1">
          {bqLines.map((l, li) => (
            <p key={li} className="text-sm leading-relaxed">{renderInline(l)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list — collect consecutive "- " / "* " / "+ " lines
    if (/^[-*+]\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={k++} className="mt-3 space-y-1.5 first:mt-0">
          {items.map((item, li) => (
            <li key={li} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className="mt-[7px] w-[5px] h-[5px] rounded-full bg-primary/60 shrink-0" />
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list — collect consecutive "1. " / "2. " lines
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={k++} className="mt-3 space-y-1.5 first:mt-0">
          {items.map((item, li) => (
            <li key={li} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className="shrink-0 min-w-[1.375rem] h-[1.375rem] rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                {li + 1}
              </span>
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,4}\s/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^[-*+]\s/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|')
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      elements.push(
        <p key={k++} className="text-sm leading-relaxed mt-2 first:mt-0 whitespace-pre-wrap break-words">
          {renderInline(paraLines.join('\n'))}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

// ── Main component ───────────────────────────────────────────────────
export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  // Split into code blocks and text segments
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const re = /```(\w*)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) segments.push({ type: 'text', content: content.slice(last, m.index) });
    segments.push({ type: 'code', language: m[1] || 'plaintext', content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) segments.push({ type: 'text', content: content.slice(last) });
  if (!segments.length) segments.push({ type: 'text', content });

  return (
    <div className="markdown-body space-y-0">
      {segments.map((seg, i) => {
        if (seg.type === 'code') {
          return (
            <div key={i} className="mt-3 first:mt-0">
              <CodeBlock
                code={seg.content}
                language={seg.language!}
                isStreaming={isStreaming && i === segments.length - 1}
              />
            </div>
          );
        }
        return (
          <div key={i}>
            {renderTextSegment(seg.content, i * 200)}
          </div>
        );
      })}
    </div>
  );
}
