import { memo, useState } from 'react';
import { Copy, Check, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/hooks/useChatStore';

interface CodeBlockProps {
  code: string;
  language: string;
  isStreaming?: boolean;
}

// Syntax color palette — light background (the AI response card is white;
// code blocks now match instead of using the dark tone that's also the
// user message bubble's color, which read as "user-colored" inside an AI
// response). Every value here is checked against the #FAFAF8-ish content
// background for WCAG AA (>=4.5:1).
const C = {
  keyword:  '#9333EA', // purple-600
  string:   '#15803D', // green-700
  comment:  '#6B5F4E', // matches --muted-foreground, already AA-verified in index.css
  literal:  '#1D4ED8', // blue-700
  number:   '#B45309', // amber-700
  type:     '#7C3AED', // violet-600
  tag:      '#BE123C', // rose-700
};

const highlightCode = (code: string, language: string): JSX.Element[] => {
  type PatternDef = { regex: RegExp; color: string; italic?: boolean };

  const patterns: Record<string, PatternDef[]> = {
    python: [
      { regex: /\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|lambda|pass|break|continue|yield|raise|assert|del|global|nonlocal|and|or|not|in|is)\b/g, color: C.keyword },
      { regex: /\b(True|False|None)\b/g, color: C.literal },
      { regex: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, color: C.number },
      { regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')/g, color: C.string },
      { regex: /#.*$/gm, color: C.comment, italic: true },
    ],
    javascript: [
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|import|export|default|async|await|class|extends|new|typeof|instanceof|throw|try|catch|finally|switch|case|break|continue|yield|of|in)\b/g, color: C.keyword },
      { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, color: C.literal },
      { regex: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, color: C.number },
      { regex: /(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, color: C.string },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
    ],
    typescript: [
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|import|export|default|async|await|class|extends|interface|type|enum|new|typeof|instanceof|throw|try|catch|finally|switch|case|break|continue|keyof|infer|never|readonly|declare|abstract|implements|namespace|module)\b/g, color: C.keyword },
      { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, color: C.literal },
      { regex: /\b(string|number|boolean|any|void|object|unknown|never|bigint|symbol)\b/g, color: C.type },
      { regex: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, color: C.number },
      { regex: /(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, color: C.string },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
    ],
    jsx: [
      { regex: /\b(const|let|var|function|return|if|else|for|while|import|export|default|async|await|class|extends|new)\b/g, color: C.keyword },
      { regex: /\b(true|false|null|undefined)\b/g, color: C.literal },
      { regex: /(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, color: C.string },
      { regex: /<\/?[A-Z][A-Za-z0-9]*|\/>/g, color: C.tag },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
    ],
    tsx: [
      { regex: /\b(const|let|var|function|return|if|else|for|while|import|export|default|async|await|class|extends|interface|type|new)\b/g, color: C.keyword },
      { regex: /\b(true|false|null|undefined)\b/g, color: C.literal },
      { regex: /\b(string|number|boolean|any|void)\b/g, color: C.type },
      { regex: /(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, color: C.string },
      { regex: /<\/?[A-Z][A-Za-z0-9]*|\/>/g, color: C.tag },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
    ],
    html: [
      { regex: /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, color: C.tag },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
    ],
    css: [
      { regex: /([.#]?[a-z-]+)\s*\{/gi, color: C.tag },
      { regex: /\b([a-z-]+)(?=\s*:)/gi, color: C.keyword },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
      { regex: /(#[0-9a-fA-F]{3,8}|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|pt|deg|s|ms)\b)/g, color: C.number },
    ],
    sql: [
      { regex: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|GROUP|BY|ORDER|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|DISTINCT|AS|LIMIT|OFFSET|UNION|ALL|CASE|WHEN|THEN|ELSE|END|NULL|NOT|AND|OR|IN|EXISTS|BETWEEN|LIKE|IS)\b/gi, color: C.keyword },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
      { regex: /\b\d+\.?\d*\b/g, color: C.number },
      { regex: /--.*$/gm, color: C.comment, italic: true },
    ],
    bash: [
      { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|source|local|readonly|declare)\b/g, color: C.keyword },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
      { regex: /#.*$/gm, color: C.comment, italic: true },
      { regex: /(\$\w+|\$\{[^}]*\})/g, color: C.tag },
    ],
    go: [
      { regex: /\b(func|var|const|type|struct|interface|map|chan|go|defer|select|switch|case|default|break|continue|return|if|else|for|range|import|package|nil|true|false)\b/g, color: C.keyword },
      { regex: /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error)\b/g, color: C.type },
      { regex: /("[^"]*"|`[^`]*`)/g, color: C.string },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
      { regex: /\b\d+\.?\d*\b/g, color: C.number },
    ],
    rust: [
      { regex: /\b(fn|let|mut|const|static|struct|enum|impl|trait|type|use|mod|pub|crate|super|self|match|if|else|for|while|loop|return|break|continue|async|await|move|ref|where|dyn|unsafe|extern|in)\b/g, color: C.keyword },
      { regex: /\b(true|false|None|Some|Ok|Err)\b/g, color: C.literal },
      { regex: /\b(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|str|String|usize|isize)\b/g, color: C.type },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
      { regex: /\b\d+\.?\d*\b/g, color: C.number },
    ],
    java: [
      { regex: /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|null|true|false|this|super|instanceof)\b/g, color: C.keyword },
      { regex: /\b(String|int|long|double|float|boolean|char|byte|short|void|Integer|Long|Double|Float|Boolean|Object|List|Map|Set|Array)\b/g, color: C.type },
      { regex: /("[^"]*"|'[^']*')/g, color: C.string },
      { regex: /\/\/.*$/gm, color: C.comment, italic: true },
      { regex: /\b\d+\.?\d*\b/g, color: C.number },
    ],
    json: [
      { regex: /("(?:[^"\\]|\\.)*")(?=\s*:)/g, color: C.type },      // keys
      { regex: /:\s*("(?:[^"\\]|\\.)*")/g, color: C.string },          // string values
      { regex: /\b(true|false|null)\b/g, color: C.literal },
      { regex: /\b\d+\.?\d*\b/g, color: C.number },
    ],
  };

  const langKey = language.toLowerCase().replace('sh', 'bash');
  const langPatterns = patterns[langKey] || [];
  const lines = code.split('\n');

  return lines.map((line, lineIdx) => {
    const parts: JSX.Element[] = [];
    let lastIndex = 0;

    if (langPatterns.length > 0) {
      const allMatches: Array<{ start: number; end: number; color: string; italic?: boolean }> = [];

      langPatterns.forEach(({ regex, color, italic }) => {
        const r = new RegExp(regex.source, regex.flags.replace('g', 'g'));
        let match;
        while ((match = r.exec(line)) !== null) {
          // Use capturing group if present
          const start = match.index + (match[0].length - (match[match.length > 1 ? match.length - 1 : 0] || match[0]).length);
          const textToHighlight = match[match.length > 1 ? match.length - 1 : 0] || match[0];
          const actualStart = match[0] === textToHighlight ? match.index : line.indexOf(textToHighlight, match.index);
          allMatches.push({ start: match.index, end: match.index + match[0].length, color, italic });
        }
      });

      allMatches.sort((a, b) => a.start - b.start);
      const merged: typeof allMatches = [];
      for (const m of allMatches) {
        if (merged.length === 0 || merged[merged.length - 1].end <= m.start) {
          merged.push(m);
        }
      }

      for (const { start, end, color, italic } of merged) {
        if (start > lastIndex) {
          parts.push(<span key={`t-${lastIndex}`} style={{ color: 'hsl(var(--foreground))' }}>{line.slice(lastIndex, start)}</span>);
        }
        parts.push(
          <span key={`h-${start}`} style={{ color, fontStyle: italic ? 'italic' : undefined }}>
            {line.slice(start, end)}
          </span>
        );
        lastIndex = end;
      }
    }

    if (lastIndex < line.length) {
      parts.push(<span key={`t-${lastIndex}`} style={{ color: 'hsl(var(--foreground))' }}>{line.slice(lastIndex)}</span>);
    }
    if (parts.length === 0 && langPatterns.length === 0) {
      parts.push(<span key="plain" style={{ color: 'hsl(var(--foreground))' }}>{line}</span>);
    }

    return (
      <div key={`line-${lineIdx}`} className="flex">
        <span
          className="select-none text-right shrink-0 pr-4"
          style={{ color: 'hsl(var(--muted-foreground))', minWidth: '2.5rem', fontSize: '0.75rem', lineHeight: 'inherit' }}
        >
          {lineIdx + 1}
        </span>
        <span className="flex-1 min-w-0">
          {parts.length > 0 ? parts : <span style={{ color: 'hsl(var(--foreground))' }}>{'\u00a0'}</span>}
        </span>
      </div>
    );
  });
};

const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', py: 'Python', python: 'Python', go: 'Go', rust: 'Rust',
  java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', html: 'HTML', css: 'CSS',
  scss: 'SCSS', json: 'JSON', yaml: 'YAML', yml: 'YAML', bash: 'Bash', sh: 'Shell',
  sql: 'SQL', md: 'Markdown', plaintext: 'Plain Text', txt: 'Plain Text',
};

export const CodeBlock = memo(function CodeBlock({ code, language, isStreaming }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = LANG_DISPLAY[language.toLowerCase()] || language || 'Code';
  const lineCount = code.split('\n').length;
  const openArtifact = useChatStore((s) => s.openArtifact);

  return (
    <div className="w-full rounded-xl overflow-hidden my-4 first:mt-0 border border-border shadow-sm">
      {/* Header — clean, minimal (no window-chrome affectation) */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {displayLang}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
          {lineCount > 3 && !isStreaming && (
            <button
              onClick={() => openArtifact({ code, language })}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 hover:bg-black/5 text-muted-foreground hover:text-foreground"
            >
              <PanelRight className="w-3 h-3" />Open artifact
            </button>
          )}
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200',
              copied ? 'bg-success/10 text-success' : 'hover:bg-black/5 text-muted-foreground hover:text-foreground'
            )}
          >
            {copied ? (
              <><Check className="w-3 h-3" />Copied</>
            ) : (
              <><Copy className="w-3 h-3" />Copy</>
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto bg-background">
        <pre
          className="p-4 text-sm font-mono leading-6 min-w-full"
          style={{ background: 'transparent', color: 'hsl(var(--foreground))', tabSize: 2 }}
        >
          {highlightCode(code, language)}
        </pre>
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs bg-muted border-t border-border text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          <span>Generating code…</span>
        </div>
      )}
    </div>
  );
});
