'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';

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

interface UseVoiceOptions {
  agentId?: string;
  userId?: string;
  model?: string;
  threadId?: string;
  token?: string;
  onTranscript?: (text: string) => void;
  onBotOutput?: (text: string, runId?: string) => void;
  onBotPartialOutput?: (text: string) => void;
  onToolResult?: (result: VoiceToolResult) => void;
  onError?: (error: string) => void;
  onThreadIdGenerated?: (threadId: string) => void;
  createThread?: () => Promise<string>;
}

interface UseVoiceReturn {
  state: VoiceConnectionState;
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  error: string | null;
  partialText: string;
  lastRunId: string | null;
  threadId: string | null;
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  toggleMute: () => void;
}

export function useVoice(options: UseVoiceOptions): UseVoiceReturn {
  const {
    agentId = 'chatbot',
    userId,
    model,
    threadId: threadIdProp,
    token,
    onTranscript,
    onBotOutput,
    onBotPartialOutput,
    onToolResult,
    onError,
    onThreadIdGenerated,
    createThread,
  } = options;

  const [state, setState] = useState<VoiceConnectionState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState<string>('');
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<any>(null);
  const audioTrackRef = useRef<any>(null);
  const pcIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<any[]>([]);
  const canSendCandidatesRef = useRef(false);
  const recentMessagesRef = useRef<Set<string>>(new Set());
  const lastMessageTimeRef = useRef<number>(0);
  const lastRunIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    pcIdRef.current = null;
    canSendCandidatesRef.current = false;
    pendingCandidatesRef.current = [];
    setState('disconnected');
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (audioTrackRef.current) {
      const newMuted = !isMuted;
      audioTrackRef.current.enabled = !newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const sendIceCandidate = useCallback(async (candidate: any) => {
    if (!pcIdRef.current) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${API_URL}/api/voice/offer`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          pc_id: pcIdRef.current,
          candidates: [{
            candidate: candidate.candidate,
            sdp_mid: candidate.sdpMid,
            sdp_mline_index: candidate.sdpMLineIndex,
          }],
        }),
      });
    } catch (err) {
      console.error('Failed to send ICE candidate:', err);
    }
  }, [token]);

  const handleDataChannelMessage = useCallback((event: any) => {
    const MESSAGE_DEBOUNCE_TIME = 500;

    try {
      const message = JSON.parse(event.data);
      console.log('[RTVI] Received:', message.type, message.data);

      if (message.label === 'rtvi-ai') {
        switch (message.type) {
          case 'user-transcription':
            if (message.data?.final && message.data?.text) {
              recentMessagesRef.current = new Set(
                Array.from(recentMessagesRef.current).filter(k => !k.startsWith('tool'))
              );
              const messageKey = `user:${message.data.text}`;
              const currentTime = Date.now();

              if (currentTime - lastMessageTimeRef.current < MESSAGE_DEBOUNCE_TIME) return;
              lastMessageTimeRef.current = currentTime;

              if (recentMessagesRef.current.has(messageKey)) return;
              recentMessagesRef.current.add(messageKey);

              onTranscript?.(message.data.text);
            }
            break;

          case 'bot-output':
            if (message.data?.text !== undefined) {
              const text = message.data.spoken || message.data.text;
              if (typeof text !== 'string') return;
              const trimmedText = text.trim();
              if (!trimmedText) return;
              const messageKey = `bot:${trimmedText}`;

              if (recentMessagesRef.current.has(messageKey)) return;
              recentMessagesRef.current.add(messageKey);

              onBotOutput?.(trimmedText, lastRunIdRef.current || undefined);
            }
            break;

          case 'bot-partial-output':
            if (onBotPartialOutput && message.data?.text) {
              onBotPartialOutput(message.data.text);
            }
            break;

          case 'run-id':
            if (message.data?.run_id) {
              lastRunIdRef.current = message.data.run_id;
              setLastRunId(message.data.run_id);
            }
            break;

          case 'tool-result':
            if (message.data && onToolResult) {
              const result: VoiceToolResult = {
                toolCallId: message.data.toolCallId,
                toolName: message.data.toolName,
                content: message.data.content,
              };
              onToolResult(result);
            }
            break;
        }
      }

      if (message.type === 'listening') {
        setIsListening(message.listening ?? false);
      }
      if (message.type === 'speaking') {
        setIsSpeaking(message.speaking ?? false);
      }
      if (message.type === 'error') {
        setError(message.message ?? 'Unknown error');
        onError?.(message.message ?? 'Unknown error');
      }
    } catch (err) {
      console.error('Error parsing data channel message:', err);
    }
  }, [onTranscript, onBotOutput, onBotPartialOutput, onToolResult, onError]);

  const startConversation = useCallback(async () => {
    if (state === 'connected' || state === 'connecting') return;

    setState('connecting');
    setError(null);
    recentMessagesRef.current.clear();
    lastMessageTimeRef.current = 0;

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];
      audioTrackRef.current = audioTrack;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      (pc as any).ontrack = (event: any) => {
        console.log('[RTVI] ontrack fired');
      };

      (pc as any).oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          cleanup();
        }
      };

      (pc as any).onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          cleanup();
        }
      };

      (pc as any).onicecandidate = async (event: any) => {
        if (event.candidate) {
          if (canSendCandidatesRef.current && pcIdRef.current) {
            await sendIceCandidate(event.candidate);
          } else {
            pendingCandidatesRef.current.push(event.candidate);
          }
        }
      };

      pc.addTrack(audioTrack, stream);

      const dc = pc.createDataChannel('pipecat');
      dcRef.current = dc;
      (dc as any).onmessage = handleDataChannelMessage;
      (dc as any).onopen = () => {
        setState('connected');
        setIsListening(true);
      };
      (dc as any).onclose = () => {
        cleanup();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const requestBody: Record<string, any> = {
        sdp: pc.localDescription?.sdp,
        type: pc.localDescription?.type,
      };

      let threadIdToUse = threadIdProp;
      if (!threadIdToUse && createThread) {
        threadIdToUse = await createThread();
        setThreadId(threadIdToUse);
        onThreadIdGenerated?.(threadIdToUse);
      } else if (threadIdToUse) {
        setThreadId(threadIdToUse);
      }

      if (agentId || userId || model || threadIdToUse) {
        const requestData: Record<string, string> = {};
        if (agentId) requestData.agent_id = agentId;
        if (userId) requestData.user_id = userId;
        if (model) requestData.model = model;
        if (threadIdToUse) requestData.thread_id = threadIdToUse;
        requestBody.request_data = requestData;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_URL}/api/voice/offer`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const answer = await response.json();
      pcIdRef.current = answer.pc_id;
      await pc.setRemoteDescription(new RTCSessionDescription({
        sdp: answer.sdp,
        type: answer.type,
      }));

      canSendCandidatesRef.current = true;
      for (const candidate of pendingCandidatesRef.current) {
        await sendIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];

      setState('connected');
      setIsListening(true);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMessage);
      setState('error');
      cleanup();
      onError?.(errorMessage);
    }
  }, [state, agentId, userId, model, handleDataChannelMessage, cleanup, sendIceCandidate, onError, token]);

  const stopConversation = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    isListening,
    isSpeaking,
    isMuted,
    error,
    partialText,
    lastRunId,
    threadId,
    startConversation,
    stopConversation,
    toggleMute,
  };
}