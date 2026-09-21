import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useChatStore } from '@/hooks/useChatStore';
import { CodeBlock } from './CodeBlock';

const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  bash: 'Bash',
  sh: 'Shell',
  sql: 'SQL',
  md: 'Markdown',
  plaintext: 'Plain Text',
  txt: 'Plain Text',
};

export function ArtifactPanel() {
  const { artifact, closeArtifact } = useChatStore();
  if (!artifact) return null;

  const title = LANG_DISPLAY[artifact.language.toLowerCase()] || artifact.language || 'Code';

  return (
    <Sheet
      open={!!artifact}
      onOpenChange={(open) => {
        if (!open) closeArtifact();
      }}
    >
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <SheetHeader className="border-b border-border px-5 py-5 text-left">
          <SheetTitle className="text-sm font-medium">{title} artifact</SheetTitle>
          <SheetDescription className="text-xs">A closer look at your code.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
          <CodeBlock code={artifact.code} language={artifact.language} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
