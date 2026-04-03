# Frontend Application

## Tổng quan
Frontend là ứng dụng web Next.js cung cấp giao diện người dùng cho hệ thống chatbot. Application kết nối với các backend services qua API Gateway để cung cấp trải nghiệm chat thông minh, tìm kiếm thông tin, và các tính năng tương tác khác.

## Công nghệ
- **Next.js 14**: React framework với App Router
- **TypeScript**: Type-safe development
- **TailwindCSS**: Utility-first CSS framework
- **Shadcn/ui**: Component library
- **Lucide React**: Icon library
- **Zustand**: State management
- **React Query**: Data fetching và caching

## Port và Endpoint
- **Development Server**: 3000
- **Production**: Build với static export hoặc server deployment

## Architecture

### Project Structure
```
frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Homepage
│   ├── chat/              # Chat pages
│   ├── dashboard/         # Admin dashboard
│   └── globals.css        # Global styles
├── components/            # Reusable components
│   ├── ui/               # Base UI components
│   ├── chat/             # Chat-specific components
│   ├── forms/            # Form components
│   └── layout/           # Layout components
├── services/             # API service layer
├── stores/               # State management
├── types/                # TypeScript definitions
├── hooks/                # Custom React hooks
├── utils/                # Utility functions
└── public/               # Static assets
```

### Core Components
1. **Chat Interface**: Real-time chat với AI agents
2. **Dashboard**: Admin interface cho analytics
3. **Navigation**: Menu và routing
4. **Authentication**: User login/logout
5. **Settings**: Configuration management

## Features

### 1. Chat Interface
- **Real-time Messaging**: WebSocket connection cho live chat
- **Multiple Agents**: Switch giữa different AI agents
- **Message History**: Persistent conversation history
- **Rich Messages**: Support text, images, files
- **Voice Input**: Microphone integration
- **Typing Indicators**: Real-time typing status

### 2. User Experience
- **Responsive Design**: Mobile-first approach
- **Dark/Light Mode**: Theme switching
- **Accessibility**: WCAG compliance
- **Internationalization**: Multi-language support
- **Progressive Web App**: PWA capabilities

### 3. Admin Dashboard
- **Analytics Overview**: System metrics và KPIs
- **User Management**: User administration
- **Content Management**: Document management
- **System Monitoring**: Service health status
- **Configuration**: System settings

### 4. Advanced Features
- **File Upload**: Document sharing với chatbot
- **Voice Chat**: Speech-to-text và text-to-speech
- **Location Services**: Indoor navigation integration
- **Search**: Global search across content
- **Notifications**: Real-time alerts

## Configuration

### Environment Variables
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8002
NEXT_PUBLIC_WS_URL=ws://localhost:8002

# Authentication
NEXT_PUBLIC_AUTH_ENABLED=true
NEXT_PUBLIC_JWT_SECRET=your-jwt-secret

# Feature Flags
NEXT_PUBLIC_VOICE_ENABLED=true
NEXT_PUBLIC_DASHBOARD_ENABLED=true
NEXT_PUBLIC_WAYFINDER_ENABLED=true

# Analytics
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

### Next.js Configuration
```javascript
// next.config.ts
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['localhost', 'your-api-domain'],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
};

module.exports = nextConfig;
```

## API Integration

### Service Layer
```typescript
// services/api.ts
class ApiService {
  private baseURL: string;
  
  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }
  
  async chat(message: string, agentId: string) {
    const response = await fetch(`${this.baseURL}/agent/${agentId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ message }),
    });
    
    return response.json();
  }
  
  async streamChat(message: string, agentId: string) {
    const response = await fetch(`${this.baseURL}/agent/${agentId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ message }),
    });
    
    return this.handleStreamResponse(response);
  }
}
```

### WebSocket Integration
```typescript
// services/websocket.ts
class WebSocketService {
  private ws: WebSocket | null = null;
  
  connect(url: string) {
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect logic
      setTimeout(() => this.connect(url), 3000);
    };
  }
  
  sendMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

## State Management

### Zustand Store
```typescript
// stores/chatStore.ts
import { create } from 'zustand';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  agentId: string;
}

interface ChatStore {
  messages: Message[];
  currentAgent: string;
  isLoading: boolean;
  
  // Actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setCurrentAgent: (agentId: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  currentAgent: 'default',
  isLoading: false,
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    }]
  })),
  
  setCurrentAgent: (agentId) => set({ currentAgent: agentId }),
  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [] }),
}));
```

## Components

### Chat Interface
```typescript
// components/chat/ChatInterface.tsx
'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { AgentSelector } from './AgentSelector';

export function ChatInterface() {
  const [input, setInput] = useState('');
  const { messages, addMessage, isLoading, currentAgent } = useChatStore();
  
  const handleSubmit = async (message: string) => {
    addMessage({ content: message, role: 'user', agentId: currentAgent });
    setInput('');
    
    try {
      const response = await apiService.chat(message, currentAgent);
      addMessage({ 
        content: response.content, 
        role: 'assistant', 
        agentId: currentAgent 
      });
    } catch (error) {
      console.error('Chat error:', error);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      <AgentSelector />
      <MessageList messages={messages} />
      <MessageInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={isLoading}
      />
    </div>
  );
}
```

### Voice Integration
```typescript
// components/chat/VoiceInput.tsx
'use client';

import { useState, useRef } from 'react';

export function VoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        const transcript = await transcribeAudio(audioBlob);
        onTranscript(transcript);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`p-2 rounded-full ${
        isRecording ? 'bg-red-500' : 'bg-blue-500'
      } text-white`}
    >
      {isRecording ? 'Stop' : 'Start'} Recording
    </button>
  );
}
```

## Styling

### TailwindCSS Configuration
```javascript
// tailwind.config.js
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
```

## Cách chạy

### Development
```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Edit configuration
# Add your API URLs and secrets
```

## Performance Optimization

### Code Splitting
```typescript
// Dynamic imports for large components
const Dashboard = dynamic(() => import('./components/Dashboard'), {
  loading: () => <div>Loading...</div>,
  ssr: false,
});
```

### Image Optimization
```typescript
// Next.js Image component
import Image from 'next/image';

<Image
  src="/profile.jpg"
  alt="Profile"
  width={500}
  height={500}
  priority={false}
  placeholder="blur"
/>
```

### Caching Strategy
```typescript
// React Query for data caching
import { useQuery } from '@tanstack/react-query';

function useUserData(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUserData(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

## Testing

### Unit Tests
```bash
npm run test
```

### E2E Tests
```bash
npm run test:e2e
```

### Component Testing
```typescript
// __tests__/ChatInterface.test.tsx
import { render, screen } from '@testing-library/react';
import { ChatInterface } from '@/components/chat/ChatInterface';

test('renders chat interface', () => {
  render(<ChatInterface />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
});
```

## Deployment

### Static Export
```bash
# Build static files
npm run build

# Export to static files
npm run export
```

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

## Security Considerations

### Client-Side Security
- Input validation
- XSS prevention
- CSRF protection
- Content Security Policy

### API Security
- JWT token management
- API key protection
- Rate limiting
- Error handling

### Data Protection
- Sensitive data handling
- Local storage encryption
- Session management
- Privacy compliance

## Accessibility

### WCAG Compliance
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Screen reader support
- Color contrast

### Implementation
```typescript
// Accessible button component
export function AccessibleButton({ children, onClick, ...props }) {
  return (
    <button
      onClick={onClick}
      aria-label={props['aria-label']}
      className="px-4 py-2 bg-blue-500 text-white rounded"
      {...props}
    >
      {children}
    </button>
  );
}
```

## Monitoring & Analytics

### Performance Monitoring
- Core Web Vitals
- Bundle size analysis
- Runtime performance
- Error tracking

### User Analytics
- Page views
- User interactions
- Feature usage
- Conversion tracking

## Future Enhancements

### Planned Features
- Progressive Web App (PWA)
- Offline support
- Push notifications
- Advanced animations
- Virtual reality integration
- Mobile app version

### Technology Improvements
- Server components
- Edge functions
- Micro-frontends
- WebAssembly integration
- Advanced state management
