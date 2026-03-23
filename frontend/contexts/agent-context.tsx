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
	agent: "chatbot",
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
	const [model, setModel] = useState("gpt-5-nano");
	const [agent, setAgent] = useState("chatbot");
	const [models, setModels] = useState<Model[]>([]);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [isOnline, setIsOnline] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	const fetchInfo = useCallback(async () => {
		try {
			const data: ServiceInfo = await agentClient.getInfo();
			setIsOnline(true);

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
			setModel(data.default_model);
			setAgent(data.default_agent);
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
	}, [fetchInfo]);

	return (
		<AgentContext.Provider
			value={{ model, setModel, agent, setAgent, models, agents, isOnline, isLoading }}
		>
			{children}
		</AgentContext.Provider>
	);
}
