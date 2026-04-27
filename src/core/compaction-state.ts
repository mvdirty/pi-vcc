import type { SectionData } from "../sections";
import { capBrief, RECALL_NOTE } from "./format";

export type CompiledLayerRole = "current" | "history" | "recall";

export interface CompiledSummaryLayer {
  name: string;
  role: CompiledLayerRole;
  text: string;
}

export interface CompileWithLayersResult {
  text: string;
  layers: CompiledSummaryLayer[];
}

export interface CompactionState {
  current: {
    sessionGoal: string[];
    currentScope: string[];
    filesAndChanges: string[];
    commits: string[];
    evidenceHandles: string[];
    userPreferences: string[];
    outstandingContext: string[];
  };
  history: {
    briefTranscript: string;
  };
  recall: {
    note: string;
  };
}

export const CURRENT_SECTION_ORDER = [
  "Session Goal",
  "Current Scope",
  "Files And Changes",
  "Commits",
  "Evidence Handles",
  "User Preferences",
  "Outstanding Context",
] as const;

export type CurrentSectionName = typeof CURRENT_SECTION_ORDER[number];

const stateKeyOf = (section: CurrentSectionName): keyof CompactionState["current"] => {
  switch (section) {
    case "Session Goal": return "sessionGoal";
    case "Current Scope": return "currentScope";
    case "Files And Changes": return "filesAndChanges";
    case "Commits": return "commits";
    case "Evidence Handles": return "evidenceHandles";
    case "User Preferences": return "userPreferences";
    case "Outstanding Context": return "outstandingContext";
  }
};

const section = (title: string, items: string[]): string => {
  if (items.length === 0) return "";
  const body = items.map((item) => `- ${item}`).join("\n");
  return `[${title}]\n${body}`;
};

export const buildCompactionState = (data: SectionData): CompactionState => ({
  current: {
    sessionGoal: data.sessionGoal,
    currentScope: data.currentScope,
    filesAndChanges: data.filesAndChanges,
    commits: data.commits,
    evidenceHandles: data.evidenceHandles,
    userPreferences: data.userPreferences,
    outstandingContext: data.outstandingContext,
  },
  history: {
    briefTranscript: data.briefTranscript,
  },
  recall: {
    note: RECALL_NOTE,
  },
});

export const renderCurrentSections = (state: CompactionState): CompiledSummaryLayer[] =>
  CURRENT_SECTION_ORDER
    .map((title) => ({ title, text: section(title, state.current[stateKeyOf(title)]) }))
    .filter((entry) => entry.text)
    .map((entry) => ({
      name: `Pi VCC ${entry.title}`,
      role: "current" as const,
      text: entry.text,
    }));

export const renderCompactionState = (
  state: CompactionState,
  options: { includeRecallNote?: boolean } = {},
): CompileWithLayersResult => {
  const layers: CompiledSummaryLayer[] = [
    ...renderCurrentSections(state),
  ];
  if (state.history.briefTranscript) {
    layers.push({
      name: "Pi VCC Brief Transcript",
      role: "history",
      text: capBrief(state.history.briefTranscript),
    });
  }
  if (options.includeRecallNote && layers.length > 0) {
    layers.push({ name: "Pi VCC Recall Note", role: "recall", text: state.recall.note });
  }

  const bodyLayers = options.includeRecallNote ? layers : layers.filter((layer) => layer.role !== "recall");
  const currentText = bodyLayers.filter((layer) => layer.role === "current").map((layer) => layer.text).join("\n\n");
  const historyText = bodyLayers.filter((layer) => layer.role === "history").map((layer) => layer.text).join("\n\n");
  const recallText = bodyLayers.filter((layer) => layer.role === "recall").map((layer) => layer.text).join("\n\n");
  const text = [currentText, historyText, recallText].filter(Boolean).join("\n\n---\n\n");
  return { text, layers: bodyLayers };
};
