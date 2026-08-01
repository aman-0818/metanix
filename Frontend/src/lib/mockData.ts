import type { Chat, Message, User } from '@/types/chat';

export const mockUser: User = {
  id: 'user-1',
  name: 'Sarah Chen',
  email: 'sarah.chen@company.com',
  role: 'user',
  avatar_url: undefined,
};

export const mockChats: Chat[] = [
  {
    id: 'chat-1',
    user_id: 'user-1',
    title: 'Q4 Sales Report Analysis',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'chat-2',
    user_id: 'user-1',
    title: 'Marketing Campaign Ideas',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'chat-3',
    user_id: 'user-1',
    title: 'Product Roadmap Planning',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'chat-4',
    user_id: 'user-1',
    title: 'Customer Feedback Summary',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export const mockMessages: Record<string, Message[]> = {
  'chat-1': [
    {
      id: 'msg-1',
      chat_id: 'chat-1',
      role: 'user',
      content: 'Can you help me analyze our Q4 sales data? I need to identify trends and areas for improvement.',
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 'msg-2',
      chat_id: 'chat-1',
      role: 'assistant',
      content: "I'd be happy to help you analyze your Q4 sales data. To provide meaningful insights, I'll need some information:\n\n1. **Data Format**: What format is your sales data in? (CSV, Excel, database export?)\n\n2. **Key Metrics**: Which metrics are most important to you?\n   - Total revenue\n   - Units sold\n   - Average order value\n   - Customer acquisition\n\n3. **Comparison Period**: Should I compare against Q3 2024 or Q4 2023?\n\nOnce you share the data, I can help identify:\n- Sales trends and patterns\n- Top-performing products/regions\n- Areas needing improvement\n- Actionable recommendations",
      created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    },
    {
      id: 'msg-3',
      chat_id: 'chat-1',
      role: 'user',
      content: 'The data is in Excel format. I want to focus on revenue and compare against Q4 last year.',
      created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    },
    {
      id: 'msg-4',
      chat_id: 'chat-1',
      role: 'assistant',
      content: "Perfect! For a year-over-year Q4 revenue comparison, please share the Excel file and I'll analyze:\n\n**Key Comparisons:**\n- Overall revenue growth/decline percentage\n- Monthly breakdown (Oct, Nov, Dec)\n- Product category performance\n- Regional variations\n\n**I'll Look For:**\n- Seasonal patterns that differ from last year\n- Products gaining or losing momentum\n- New revenue opportunities\n\nYou can upload the file directly here, and I'll generate a comprehensive analysis with visualizations.",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
  ],
  'chat-2': [
    {
      id: 'msg-5',
      chat_id: 'chat-2',
      role: 'user',
      content: 'I need some creative ideas for our spring marketing campaign targeting millennials.',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
    {
      id: 'msg-6',
      chat_id: 'chat-2',
      role: 'assistant',
      content: "Here are some creative spring marketing campaign ideas targeting millennials:\n\n### 🌸 Experience-First Campaigns\n\n1. **\"Spring Reset\" Challenge**\n   - 30-day social media challenge\n   - User-generated content with branded hashtag\n   - Daily micro-challenges (wellness, sustainability)\n\n2. **Pop-Up Experiences**\n   - Instagram-worthy installations\n   - AR filters for virtual try-ons\n   - Collaboration with local artists\n\n### 📱 Digital-Native Approaches\n\n3. **TikTok Series**\n   - Behind-the-scenes content\n   - Influencer partnerships (micro > macro)\n   - Interactive polls and duets\n\n4. **Gamification**\n   - Rewards app integration\n   - Scavenger hunts with prizes\n   - Points for social sharing\n\nWant me to develop any of these ideas further?",
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
  ],
  'chat-3': [],
  'chat-4': [],
};

// Simulate streaming response
export const simulateStreamingResponse = (
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onStart: () => void
): (() => void) => {
  const response = `Thank you for your question. Let me provide a comprehensive response.

Here are the key points to consider:

1. **Strategic Planning**
   - Define clear objectives and KPIs
   - Identify key stakeholders early
   - Create a realistic timeline with milestones

2. **Resource Allocation**
   - Assess current team capacity
   - Identify skill gaps and training needs
   - Budget for contingencies

3. **Risk Management**
   - Document potential risks and mitigations
   - Establish communication protocols
   - Plan for regular check-ins and adjustments

Would you like me to elaborate on any of these areas?`;

  let index = 0;
  let timeoutId: ReturnType<typeof setTimeout>;
  
  // Simulate initial wait (queuing)
  const waitTime = Math.random() * 500 + 200;
  
  timeoutId = setTimeout(() => {
    onStart();
    
    const streamChunk = () => {
      if (index < response.length) {
        // Random chunk size for natural feel
        const chunkSize = Math.floor(Math.random() * 3) + 1;
        const chunk = response.slice(index, index + chunkSize);
        onChunk(chunk);
        index += chunkSize;
        
        // Variable delay for natural streaming
        const delay = Math.random() * 30 + 10;
        timeoutId = setTimeout(streamChunk, delay);
      } else {
        onComplete();
      }
    };
    
    streamChunk();
  }, waitTime);
  
  // Return cleanup function
  return () => clearTimeout(timeoutId);
};
