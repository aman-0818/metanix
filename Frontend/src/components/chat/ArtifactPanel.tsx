import { X } from 'lucide-react';
import { useChatStore } from '@/hooks/useChatStore';
import { CodeBlock } from './CodeBlock';

const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  jsx: 'JSX', tsx: 'TSX', py: 'Python', python: 'Python', go: 'Go', rust: 'Rust',
  java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', html: 'HTML', css: 'CSS',
  scss: 'SCSS', json: 'JSON', yaml: 'YAML', yml: 'YAML', bash: 'Bash', sh: 'Shell',
  sql: 'SQL', md: 'Markdown', plaintext: 'Plain Text', txt: 'Plain Text',
};

export function ArtifactPanel() {
  const { artifact, closeArtifact } = useChatStore();
  if (!artifact) return null;

  const title = LANG_DISPLAY[artifact.language.toLowerCase()] || artifact.language || 'Code';

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={closeArtifact} />
      <aside className="fixed right-0 top-0 z-40 h-[100dvh] w-full sm:w-[46%] sm:min-w-[420px] sm:max-w-[560px] bg-background border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/60 shrink-0">
          <h3 className="text-sm font-semibold truncate">{title} artifact</h3>
          <button
            onClick={closeArtifact}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close artifact"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
          <CodeBlock code={artifact.code} language={artifact.language} />
        </div>
      </aside>
    </>
  );
}
