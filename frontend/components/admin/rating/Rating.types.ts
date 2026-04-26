export interface RatingRow {
  id: string;
  userId: string;
  userName: string;
  runId: string;
  threadId: string;
  threadName: string;
  agentId: string | null;
  sessionId: string;
  sessionUuid: string;
  pair: number;
  date: string;
  time: string;
  question: string;
  questionFull: string;
  answer: string;
  answerFull: string;
  sentiment: "positive" | "negative";
  comment: string;
  createdAt: string;
  updatedAt: string;
}
