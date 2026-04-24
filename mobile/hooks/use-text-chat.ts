'use client';

import { useState, useCallback, useRef } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8002';

export type VoiceConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface VoiceToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
}

interface UseTextChatOptions {
  agentId?: string;
  userId?: string;
  token?: string;
  onBotOutput?: (text: string, runId?: string) => void;
  onToolResult?: (result: VoiceToolResult) => void;
  onError?: (error: string) => void;
}

interface UseTextChatReturn {
  state: VoiceConnectionState;
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

export function useTextChat(options: UseTextChatOptions): UseTextChatReturn {
  const { agentId = 'chatbot', userId, token, onBotOutput, onToolResult, onError } = options;
  const [state, setState] = useState<VoiceConnectionState>('idle');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setState('connecting');
    setIsLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body: Record<string, string> = {
        message: text,
        agent_id: agentId,
      };
      if (userId) body.user_id = userId;

      const response = await fetch(`${API_URL}/api/chat/text`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data.message) {
        onBotOutput?.(data.message, data.run_id);
      }
      
      if (data.tool_results) {
        data.tool_results.forEach((result: any) => {
          if (onToolResult) {
            onToolResult({
              toolCallId: result.tool_call_id || `tool-${Date.now()}`,
              toolName: result.tool_name,
              content: result.content,
            });
          }
        });
      }

      setState('connected');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setState('error');
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, userId, token, isLoading, onBotOutput, onToolResult, onError]);

  const clearMessages = useCallback(() => {
    setState('idle');
  }, []);

  return {
    state,
    isLoading,
    sendMessage,
    clearMessages,
  };
}