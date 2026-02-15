import React from 'react';
import { GenerateContentResponse } from '@google/genai';

export type AppView = 'splash' | 'terminal';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string; // e.g., '🦊' for Fox, '🤖' for Bleak
  description: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isBot: boolean;
  type: 'command' | 'ai-response' | 'system-message' | 'error' | 'terminal-game' | 'nlu-processing' | 'nlu-clarification';
}

export interface LookingGlassState {
  isVisible: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: React.ReactNode | null;
  title: string;
}

export interface AppSnapshot {
  id: string;
  timestamp: string;
  description: string;
  appState: {
    currentView: AppView;
    currentUserProfileId: string;
    lookingGlassState: LookingGlassState;
  };
  terminalState: {
    terminalOutput: ChatMessage[];
    currentUserProfile: UserProfile;
    liveSessionActive: boolean;
    // Add other relevant terminal states if needed for full restore
  };
  conceptualFileContents: { [key: string]: string }; // E.g., 'ClaudeDevNotes.md': 'content...'
}

export interface SnapshotService {
  saveSnapshot(snapshot: AppSnapshot): void;
  listSnapshots(): AppSnapshot[];
  loadSnapshot(id: string): AppSnapshot | null;
  deleteSnapshot(id: string): void;
}

export interface SnapshotListDisplayProps {
  snapshots: AppSnapshot[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export interface LookingGlassContextType {
  lookingGlassState: LookingGlassState;
  updateLookingGlassContent: (content: React.ReactNode, title: string) => void;
  toggleLookingGlass: (isVisible?: boolean) => void;
  takeSnapshot: (description: string) => void;
  showSnapshotList: () => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
}

export type LLMModelName =
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'gemini-2.5-flash-native-audio-preview-12-2025'
  | 'gemini-3-pro-image-preview';

export type LLMModelConfig = {
  temperature?: number;
  topK?: number;
  topP?: number;
  responseMimeType?: string;
  seed?: number;
  maxOutputTokens?: number;
  thinkingConfig?: { thinkingBudget: number };
  systemInstruction?: string; // Added to allow NLU to modify it
};

// --- Gemini Live API Specific Types & Utilities ---
// These are simplified for frontend context. Full types are in @google/genai
export interface Blob {
  data: string;
  mimeType: string;
}

export interface LiveServerContent {
  modelTurn?: {
    parts: Array<{
      inlineData?: Blob;
      text?: string;
    }>;
  };
  interrupted?: boolean;
  outputTranscription?: {
    text: string;
    isFinal: boolean;
  };
  inputTranscription?: {
    text: string;
    isFinal: boolean;
  };
  turnComplete?: boolean;
}

export interface ToolCall {
  functionCalls: Array<{
    args: Record<string, unknown>;
    name: string;
    id: string;
  }>;
}

export interface LiveServerMessage {
  serverContent?: LiveServerContent;
  toolCall?: ToolCall;
}

export interface ChatSession {
  sendRealtimeInput: (input: { media: Blob }) => void;
  sendToolResponse: (response: {
    functionResponses: { id: string; name: string; response: any };
  }) => void;
  close: () => void;
}

export interface AudioBufferSourceNodeExt extends AudioBufferSourceNode {
  stop: () => void;
}

export type LLMResponseChunk = GenerateContentResponse & {
  text?: string;
};