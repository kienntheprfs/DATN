export interface RatingRow {
  id: string;
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
}
