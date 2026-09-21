import { FileText, Presentation, Code2 } from 'lucide-react';
import { ChatInput } from './ChatInput';
import { useChatStore } from '@/hooks/useChatStore';
import { useAuthStore } from '@/hooks/useAuthStore';
import { Brand } from '@/components/Brand';
interface EmptyChatProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  showStop?: boolean;
  isWaiting?: boolean;
}
export function EmptyChat(props: EmptyChatProps) {
  const { user, username } = useAuthStore();
  const name = user?.first_name?.trim() || (username || 'there').split('@')[0].split(/[._-]/)[0];
  return (
    <div className="welcome-workspace">
      <div className="flex items-center gap-3 mb-7">
        <Brand compact />
        <span className="eyebrow">A SPACE FOR YOUR NEXT IDEA</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Welcome back, <span className="capitalize">{name}</span>.
      </p>
      <h1>Think. Create. Transform.</h1>
      <p className="welcome-intro">
        Big questions. Rough drafts. New directions.
        <br className="sm:hidden" /> Start anywhere.
      </p>
      <ChatInput {...props} variant="floating" placeholder="What would you like to work on?" />
      <div className="suggestion-grid">
        <button
          className="suggestion-card"
          onClick={() => {
            useChatStore
              .getState()
              .setPendingPrompt('Summarize the key insights from this document.');
            document
              .querySelector<HTMLButtonElement>('button[aria-label="Attach a document"]')
              ?.click();
          }}
        >
          <FileText />
          <span>
            <strong>Analyze a document</strong>
            <small>Find the details that matter</small>
          </span>
        </button>
        <button
          className="suggestion-card"
          onClick={() => {
            useChatStore.getState().setChatMode('presentation');
            useChatStore.getState().setPendingPrompt('Create a presentation about ');
          }}
        >
          <Presentation />
          <span>
            <strong>Create a presentation</strong>
            <small>Give your next idea a stage</small>
          </span>
        </button>
        <button
          className="suggestion-card"
          onClick={() => {
            useChatStore.getState().setChatMode('code');
            useChatStore.getState().setPendingPrompt('Help me understand and improve this code: ');
          }}
        >
          <Code2 />
          <span>
            <strong>Build something better</strong>
            <small>Work through a coding challenge</small>
          </span>
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-7">
        Your ideas, with a little more possibility.
      </p>
    </div>
  );
}
