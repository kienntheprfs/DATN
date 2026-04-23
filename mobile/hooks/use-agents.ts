'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8002';

export type VoiceConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface VoiceToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'executing' | 'done';
  content: string | null;
}

export interface VoiceToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
}

export interface Agent {
  key: string;
  description: string;
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/agent/info`);
        const data = await res.json();
        setAgents(data.agents || []);
      } catch (err) {
        console.error('[useAgents] Error:', err);
        setAgents([{ key: 'chatbot', description: 'Default chatbot' }]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAgents();
  }, []);

  return { agents, isLoading };
}