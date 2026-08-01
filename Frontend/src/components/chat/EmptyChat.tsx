import { useState } from 'react';
import { ChatInput } from './ChatInput';
import { useChatStore } from '@/hooks/useChatStore';
import { useAuthStore } from '@/hooks/useAuthStore';

const SUGGESTIONS = ['Polish this email', 'Explain a tricky bug', 'Plan my week', 'Summarize a doc'];

const GREETING_MESSAGES = [
  "let's make something great",
  "what's on your mind today?",
  'ready when you are',
  "let's build something great",
  'what are we creating today?',
  "let's get something done",
  'where should we start?',
  "let's turn ideas into action",
  "what's the plan today?",
  "let's make today count",
];

interface EmptyChatProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  showStop?: boolean;
  isWaiting?: boolean;
}

// AD/local usernames are often an email (deepak.singh@aionos.ai) — prefer the
// first name from the user's profile, falling back to a title-cased guess
// from the username's local part rather than showing the raw email.
function displayNameFor(user: { first_name?: string; username: string } | null, username: string | null): string {
  if (user?.first_name?.trim()) return user.first_name.trim();
  const raw = username || user?.username || '';
  const localPart = raw.split('@')[0];
  const first = localPart.split(/[._-]/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

export function EmptyChat({ onSend, onStop, showStop, isWaiting }: EmptyChatProps) {
  const username = useAuthStore((s) => s.username);
  const user = useAuthStore((s) => s.user);
  const [message] = useState(() => GREETING_MESSAGES[Math.floor(Math.random() * GREETING_MESSAGES.length)]);
  const greeting = `Hi ${displayNameFor(user, username)}, ${message}`;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-[60px] animate-fade-in">
      <div className="flex flex-col items-center gap-8 mb-[34px]">
        <img src="/company-logo.png" alt="AionOS" className="h-8 sm:h-10 w-auto" />
        <h1 className="font-serif italic text-[32px] sm:text-[36px] font-normal m-0 text-foreground leading-none">
          {greeting}
        </h1>
      </div>

      <div className="w-full max-w-[760px]">
        <ChatInput
          variant="floating"
          onSend={onSend}
          onStop={onStop}
          showStop={showStop}
          isWaiting={isWaiting}
          placeholder="Ask Aionos AI anything..."
        />
        <div className="flex flex-wrap gap-2 justify-center mt-[18px]">
          {SUGGESTIONS.map((text) => (
            <button
              key={text}
              onClick={() => useChatStore.getState().setPendingPrompt(text)}
              className="bg-card border border-border rounded-full px-[15px] py-2 text-[13.5px] text-[#5C5546] transition-colors hover:border-primary hover:text-primary"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
