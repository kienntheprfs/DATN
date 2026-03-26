"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface UseVoiceOptions {
  voiceServerUrl?: string;
  agentId?: string;
  model?: string;
  onTranscript?: (text: string) => void;
  onBotOutput?: (text: string) => void;
  onBotPartialOutput?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceReturn {
  state: VoiceConnectionState;
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  error: string | null;
  partialText: string;
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  toggleMute: () => void;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    voiceServerUrl = "http://localhost:7860",
    agentId = "chatbot",
    model,
    onTranscript,
    onBotOutput,
    onBotPartialOutput,
    onError,
  } = options;

  const [state, setState] = useState<VoiceConnectionState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState<string>("");
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
      await fetch(`${voiceServerUrl}/api/offer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
  }, [voiceServerUrl]);

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    const MESSAGE_DEBOUNCE_TIME = 500;

    try {
      const message = JSON.parse(event.data);
      
      // RTVI protocol: message has label "rtvi-ai" and type
      if (message.label === "rtvi-ai") {
        switch (message.type) {
          case "user-transcription":
            // Only process final transcriptions
            if (message.data?.final && message.data?.text) {
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
            if (message.data?.text && message.data?.spoken) {
              const text = message.data.text;
              const messageKey = `bot:${text}`;

              if (recentMessagesRef.current.has(messageKey)) {
                return;
              }
              recentMessagesRef.current.add(messageKey);

              if (recentMessagesRef.current.size > 50) {
                const entries = Array.from(recentMessagesRef.current);
                recentMessagesRef.current.clear();
                entries.slice(-25).forEach(entry => recentMessagesRef.current.add(entry));
              }

              if (onBotOutput) {
                onBotOutput(text);
              }
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
  }, [onTranscript, onBotOutput, onBotPartialOutput, onError]);

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

      // Add request_data if agent_id or model is provided
      if (agentId || model) {
        const requestData: Record<string, string> = {};
        if (agentId) requestData.agent_id = agentId;
        if (model) requestData.model = model;
        requestBody.request_data = requestData;
      }

      const response = await fetch(`${voiceServerUrl}/api/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  }, [state, voiceServerUrl, agentId, model, handleDataChannelMessage, cleanup, sendIceCandidate, onError]);

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
    startConversation,
    stopConversation,
    toggleMute,
  };
}
