import type { Values } from "./documents";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FieldUpdate = {
  key: string;
  value: string;
};

export type ChatTurn = {
  reply: string;
  documentType: string | null;
  updates: FieldUpdate[];
};

export const GREETING = `Hi! What type of document would you like to create? For example:
- Mutual NDA
- Cloud Service Agreement
- Professional Services Agreement
- Software License Agreement
- Data Processing Agreement

Or just tell me what you’re trying to do, and I’ll recommend the right one.`;

/** Empty in production, where the backend serves the frontend. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Earlier details survive trimming because `values` holds them. */
const MAX_MESSAGES = 40;

export async function sendChat(
  messages: ChatMessage[],
  documentType: string | null,
  values: Values,
  today: string,
): Promise<ChatTurn> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.slice(-MAX_MESSAGES),
      documentType,
      values,
      today,
    }),
  });
  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }
  return response.json();
}

export function applyUpdates(values: Values, updates: FieldUpdate[]): Values {
  return {
    ...values,
    ...Object.fromEntries(updates.map(({ key, value }) => [key, value])),
  };
}
