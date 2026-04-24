"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/services/auth-api";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface VoiceToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "executing" | "done";
  content: string | null;
}

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
  onTranscript?: (text: string) => void;
  onBotOutput?: (text: string, runId?: string) => void;
  onBotPartialOutput?: (text: string) => void;
  onToolStarted?: (toolCalls: Array<{ id: string; name: string; args?: Record<string, unknown> }>) => void;
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
    agentId = "chatbot",
    userId,
    model,
    threadId: threadIdProp,
    onTranscript,
    onBotOutput,
    onBotPartialOutput,
    onToolStarted,
    onToolResult,
    onError,
    onThreadIdGenerated,
    createThread,
  } = options;

  const [state, setState] = useState<VoiceConnectionState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState<string>("");
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const lastRunIdRef = useRef<string | null>(null);
  const partialTextRef = useRef<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const pcIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const canSendCandidatesRef = useRef(false);
  const recentMessagesRef = useRef<Set<string>>(new Set());
  const lastMessageTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    pcIdRef.current = null;
    canSendCandidatesRef.current = false;
    pendingCandidatesRef.current = [];
    setState("disconnected");
    setIsListening(false);
    setIsSpeaking(false);
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (audioTrackRef.current) {
      const newMuted = !isMuted;
      audioTrackRef.current.enabled = !newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const sendIceCandidate = useCallback(async (candidate: RTCIceCandidate) => {
    if (!pcIdRef.current) return;

    try {
      const authHeaders = getAuthHeaders();
      
      await fetch("/api/voice/offer", {
        method: "PATCH",
        headers: { 
          ...authHeaders,
        },
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
      console.error("Failed to send ICE candidate:", err);
    }
  }, []);

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    const MESSAGE_DEBOUNCE_TIME = 500;

    try {
      const message = JSON.parse(event.data);
      console.log("[RTVI] Received message:", message.type, message.data);
      
      // RTVI protocol: message has label "rtvi-ai" and type
      if (message.label === "rtvi-ai") {
        switch (message.type) {
          case "user-transcription":
            // Only process final transcriptions
            if (message.data?.final && message.data?.text) {
              // Clear tool-related messages when new user input comes
              recentMessagesRef.current = new Set(
                Array.from(recentMessagesRef.current).filter(k => !k.startsWith('tool'))
              );
              const messageKey = `user:${message.data.text}`;
              const currentTime = Date.now();

              // Debounce check
              if (currentTime - lastMessageTimeRef.current < MESSAGE_DEBOUNCE_TIME) {
                return;
              }
              lastMessageTimeRef.current = currentTime;

              // Check for duplicates
              if (recentMessagesRef.current.has(messageKey)) {
                return;
              }
              recentMessagesRef.current.add(messageKey);

              // Cleanup old messages
              if (recentMessagesRef.current.size > 50) {
                const entries = Array.from(recentMessagesRef.current);
                recentMessagesRef.current.clear();
                entries.slice(-25).forEach(entry => recentMessagesRef.current.add(entry));
              }

              if (onTranscript) {
                onTranscript(message.data.text);
              }
            }
            break;

          case "bot-output":
            if (message.data?.text !== undefined) {
              const text = message.data.spoken || message.data.text;
              // Ensure text is a string
              if (typeof text !== "string") {
                console.log("[RTVI] Skipping non-string bot-output:", typeof text);
                return;
              }
              const trimmedText = text.trim();
              if (!trimmedText) {
                return;
              }
              // Use exact text match for deduplication
              const messageKey = `bot:${trimmedText}`;
              
              // Check if this exact message was already sent
              if (recentMessagesRef.current.has(messageKey)) {
                console.log("[RTVI] Skipping duplicate bot-output");
                return;
              }
              
              recentMessagesRef.current.add(messageKey);

              if (recentMessagesRef.current.size > 50) {
                const entries = Array.from(recentMessagesRef.current);
                recentMessagesRef.current.clear();
                entries.slice(-25).forEach(entry => recentMessagesRef.current.add(entry));
              }

              if (onBotOutput) {
                console.log("[RTVI] onBotOutput:", trimmedText, "run_id from ref:", lastRunIdRef.current);
                onBotOutput(trimmedText, lastRunIdRef.current || undefined);
              }
            }
            break;

          case "run-id":
            if (message.data?.run_id) {
              lastRunIdRef.current = message.data.run_id;
              setLastRunId(message.data.run_id);
              console.log("[RTVI] run-id received, stored in ref:", message.data.run_id);
            }
            break;

          case "tool-started":
            if (message.data?.toolCalls && onToolStarted) {
              // Deduplicate by tool names
              const toolNames = message.data.toolCalls.map((tc: any) => tc.name).join(',');
              const messageKey = `tool:${toolNames}`;
              console.log("[RTVI] Tool started, key:", messageKey, "existing:", recentMessagesRef.current.has(messageKey));
              if (recentMessagesRef.current.has(messageKey)) {
                console.log("[RTVI] Skipping duplicate tool-started");
                return;
              }
              recentMessagesRef.current.add(messageKey);
              console.log("[RTVI] Processing tool-started");
              const toolCalls = message.data.toolCalls.map((tc: { id?: string; name: string; args?: Record<string, unknown> }) => ({
                id: tc.id || `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: tc.name,
                args: tc.args,
              }));
              onToolStarted(toolCalls);
            }
            break;

          case "tool-result":
            if (message.data && onToolResult) {
              const messageKey = `tool-result:${message.data.toolCallId}`;
              if (recentMessagesRef.current.has(messageKey)) {
                return;
              }
              recentMessagesRef.current.add(messageKey);
              if (recentMessagesRef.current.size > 50) {
                const entries = Array.from(recentMessagesRef.current);
                recentMessagesRef.current.clear();
                entries.slice(-25).forEach(entry => recentMessagesRef.current.add(entry));
              }
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

      // Also handle simpler protocol if needed
      if (message.type === "listening") {
        setIsListening(message.listening ?? false);
      }
      if (message.type === "speaking") {
        setIsSpeaking(message.speaking ?? false);
      }
      if (message.type === "error") {
        setError(message.message ?? "Unknown error");
        onError?.(message.message ?? "Unknown error");
      }
    } catch (err) {
      console.error("Error parsing data channel message:", err);
    }
  }, [onTranscript, onBotOutput, onBotPartialOutput, onToolStarted, onToolResult, onError, lastRunId, setLastRunId]);

  const startConversation = useCallback(async () => {
    if (state === "connected" || state === "connecting") {
      return;
    }

    setState("connecting");
    setError(null);
    recentMessagesRef.current.clear();
    lastMessageTimeRef.current = 0;

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = audioStream.getAudioTracks()[0];
      audioTrackRef.current = audioTrack;

      const iceServers: RTCIceServer[] = [
        { urls: "stun:stun.l.google.com:19302" },
      ];

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const audioElement = new Audio();
      audioElement.autoplay = true;
      audioRef.current = audioElement;

      pc.ontrack = (event) => {
        if (audioElement.srcObject !== event.streams[0]) {
          audioElement.srcObject = event.streams[0];
        }
      };

      // Create data channel for RTVI messages
      const dc = pc.createDataChannel("pipecat");
      dcRef.current = dc;
      dc.onmessage = handleDataChannelMessage;
      dc.onopen = () => {
        setState("connected");
        setIsListening(true);
      };
      dc.onclose = () => {
        cleanup();
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          cleanup();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          cleanup();
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          if (canSendCandidatesRef.current && pcIdRef.current) {
            await sendIceCandidate(event.candidate);
          } else {
            pendingCandidatesRef.current.push(event.candidate);
          }
        }
      };

      // Add transceivers (required by SmallWebRTCTransport)
      pc.addTransceiver(audioTrack, { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Build request body
      const requestBody: Record<string, unknown> = {
        sdp: pc.localDescription?.sdp,
        type: pc.localDescription?.type,
      };

      const authHeaders = getAuthHeaders();

      // Create thread if not provided
      let threadIdToUse = threadIdProp;
      if (!threadIdToUse && createThread) {
        threadIdToUse = await createThread();
        setThreadId(threadIdToUse);
        onThreadIdGenerated?.(threadIdToUse);
      } else if (threadIdToUse) {
        setThreadId(threadIdToUse);
      }

      // Add request_data if agent_id, user_id, model, or thread_id is provided
      if (agentId || userId || model || threadIdToUse) {
        const requestData: Record<string, string> = {};
        if (agentId) requestData.agent_id = agentId;
        if (userId) requestData.user_id = userId;
        if (model) requestData.model = model;
        if (threadIdToUse) requestData.thread_id = threadIdToUse;
        requestBody.request_data = requestData;
        console.log("[useVoice] Sending request_data:", requestData);
      }

      const response = await fetch("/api/voice/offer", {
        method: "POST",
        headers: { 
          ...authHeaders,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const answer = await response.json();
      pcIdRef.current = answer.pc_id;
      await pc.setRemoteDescription({
        sdp: answer.sdp,
        type: answer.type,
      });

      // Now we can send ICE candidates
      canSendCandidatesRef.current = true;

      for (const candidate of pendingCandidatesRef.current) {
        await sendIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];

      setState("connected");
      setIsListening(true);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect";
      setError(errorMessage);
      setState("error");
      cleanup();
      onError?.(errorMessage);
    }
  }, [state, agentId, userId, model, handleDataChannelMessage, cleanup, sendIceCandidate, onError]);

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
