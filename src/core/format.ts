import type { SectionData } from "../sections";

const section = (title: string, items: string[]): string => {
  if (items.length === 0) return "";
  const body = items.map((i) => `- ${i}`).join("\n");
  return `[${title}]\n${body}`;
};

const filesSection = (data: SectionData): string => {
  const parts: string[] = [];
  if (data.filesRead.length > 0)
    parts.push("Read:\n" + data.filesRead.map((f) => `  - ${f}`).join("\n"));
  if (data.filesModified.length > 0)
    parts.push("Modified:\n" + data.filesModified.map((f) => `  - ${f}`).join("\n"));
  if (data.filesCreated.length > 0)
    parts.push("Created:\n" + data.filesCreated.map((f) => `  - ${f}`).join("\n"));
  if (parts.length === 0) return "";
  return `[Files And Changes]\n${parts.join("\n")}`;
};

export const formatSummary = (data: SectionData): string => {
  const parts = [
    section("Session Goal", data.sessionGoal),
    section("Key Conversation Turns", data.keyConversationTurns),
    section("Actions Taken", data.actionsTaken),
    section("Important Evidence", data.importantEvidence),
    filesSection(data),
    section("Outstanding Context", data.outstandingContext),
    section("User Preferences", data.userPreferences),
  ];
  return parts.filter(Boolean).join("\n\n");
};


