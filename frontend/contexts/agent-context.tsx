"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { agentClient, ServiceInfo } from "@/services/agent";

interface Model {
	id: string;
	name: string;
	provider: string;
}

interface Agent {
	key: string;
	description: string;
}

interface AgentContextType {
	model: string;
	setModel: (model: string) => void;
	agent: string;
	setAgent: (agent: string) => void;
	models: Model[];
	agents: Agent[];
	isOnline: boolean;
	isLoading: boolean;
}

const AgentContext = createContext<AgentContextType>({
	model: "gpt-5-nano",
	setModel: () => {},
	agent: "router-agent",
	setAgent: () => {},
	models: [],
	agents: [],
	isOnline: false,
	isLoading: true,
});

export function useAgent() {
	return useContext(AgentContext);
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
	const [model, setModelState] = useState("gpt-5-nano");
	const [agent, setAgentState] = useState("router-agent");
	const [models, setModels] = useState<Model[]>([]);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [isOnline, setIsOnline] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [defaultModel, setDefaultModel] = useState("gpt-5-nano");

	const setModel = useCallback((value: string) => {
		setModelState(value);
		if (typeof window !== "undefined") {
			localStorage.setItem("selectedModel", value);
		}
	}, []);

	const setAgent = useCallback((value: string) => {
		setAgentState(value);
		if (typeof window !== "undefined") {
			localStorage.setItem("selectedAgent", value);
		}
	}, []);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const savedModel = localStorage.getItem("selectedModel");
			const savedAgent = localStorage.getItem("selectedAgent");
			if (savedModel) setModelState(savedModel);
			if (savedAgent) setAgentState(savedAgent);
		}
	}, []);

	const fetchInfo = useCallback(async () => {
		try {
			const data: ServiceInfo = await agentClient.getInfo();
			setIsOnline(true);

			setDefaultModel(data.default_model);

			const modelList: Model[] = data.models.map((m) => {
				let provider = "Unknown";
				if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) provider = "OpenAI";
				else if (m.includes("deepseek")) provider = "DeepSeek";
				else if (m.includes("gemini")) provider = "Google";
				else if (m.includes("claude")) provider = "Anthropic";
				else if (m.includes("llama")) provider = "Meta";
				else if (m.includes("bedrock")) provider = "AWS";
				return { id: m, name: m, provider };
			});

			setModels(modelList);
			setAgents(data.agents);

			if (typeof window !== "undefined") {
				const savedModel = localStorage.getItem("selectedModel");
				const savedAgent = localStorage.getItem("selectedAgent");
				setModelState(savedModel || data.default_model);
				setAgentState(savedAgent || data.default_agent);
			} else {
				setModelState(data.default_model);
				setAgentState(data.default_agent);
			}
		} catch {
			setIsOnline(false);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchInfo();
		const interval = setInterval(fetchInfo, 30000);
		return () => clearInterval(interval);
	}, []);

	return (
		<AgentContext.Provider
			value={{ model, setModel, agent, setAgent, models, agents, isOnline, isLoading }}
		>
			{children}
		</AgentContext.Provider>
	);
}
