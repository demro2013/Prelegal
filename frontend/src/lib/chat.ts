import { apiRequest } from "./api";
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

/** Earlier details survive trimming because `values` holds them. */
const MAX_MESSAGES = 40;

export function sendChat(
  messages: ChatMessage[],
  documentType: string | null,
  values: Values,
  today: string,
): Promise<ChatTurn> {
  return apiRequest("/chat", {
    method: "POST",
    body: {
      messages: messages.slice(-MAX_MESSAGES),
      documentType,
      values,
      today,
    },
  });
}

export function applyUpdates(values: Values, updates: FieldUpdate[]): Values {
  return {
    ...values,
    ...Object.fromEntries(updates.map(({ key, value }) => [key, value])),
  };
}
