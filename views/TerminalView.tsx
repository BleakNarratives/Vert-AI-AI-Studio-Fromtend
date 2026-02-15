import React, { useState, useRef, useEffect, useContext, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  ChatMessage,
  LLMModelConfig,
  LLMModelName,
  LiveServerMessage,
  ChatSession,
  UserProfile, // Import UserProfile
  AppSnapshot, // Import AppSnapshot
} from '../types';
import {
  generateContent,
  startLiveSession,
  createPcmBlob,
} from '../services/geminiService';
import LoadingSpinner from '../components/LoadingSpinner';
import { LookingGlassContext } from '../App';
import CodeEditor from '../components/CodeEditor';
import ForgeRing from '../components/ForgeRing';
import AudioPlayer from '../components/AudioPlayer';
import { USER_PROFILES } from '../constants'; // Import USER_PROFILES

// Imported lore/conceptual content
import ClaudeDevNotes from '../content/GlassForge_ModMind_DevNotes.md?raw';
import SwarmMonitoringGuide from '../content/SWARM_MONITORING_README.md?raw';
import SwarmPilotingGuide from '../content/SWARM_PILOTING_GUIDE.md?raw';
// Import conceptual code files for simulated refactoring analysis (original set)
import PainEngineCode from '../pain_engine.py?raw'; 
import ScraperCode from '../scraper.py?raw';
import CelticLoomCompleteCode from '../celtic_loom_complete.py?raw';

// NOTE: Temporarily removed newly added conceptual Python/Markdown files
// to simplify the build and focus on preview repair as per user request.


interface TerminalViewProps {
  genAI: GoogleGenAI | null;
  modelName: LLMModelName;
  liveModelName: LLMModelName;
  modelConfig: LLMModelConfig;
  isGeminiActive: boolean;
  onSelectApiKey: () => void;
  initialStateFromSnapshot?: AppSnapshot['terminalState'] | null; // New prop for snapshot restore
}

// NLU Output structure (conceptual)
interface NLUOutput {
  intent: string;
  parameters?: Record<string, any>;
  nuance?: string; // e.g., "be concise", "provide harsh critique"
  clarificationNeeded?: boolean;
  clarificationMessage?: string;
  commandType: 'local' | 'ai_generate' | 'ai_live' | 'conceptual' | 'game' | 'unknown';
}

const TerminalView = forwardRef<any, TerminalViewProps>(({
  genAI,
  modelName,
  liveModelName,
  modelConfig,
  isGeminiActive,
  onSelectApiKey,
  initialStateFromSnapshot, // Destructure new prop
}, ref) => {
  const [terminalOutput, setTerminalOutput] = useState<ChatMessage[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveSessionActive, setLiveSessionActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile>(USER_PROFILES[0]); // Default profile
  const [jailbreakAttempt, setJailbreakAttempt] = useState(0); // For Easter egg

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookingGlassContext = useContext(LookingGlassContext);

  // Live session management
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<ChatSession> | null>(null);

  // Expose internal state for snapshotting via ref
  useImperativeHandle(ref, () => ({
    getTerminalState: () => ({
      terminalOutput,
      currentUserProfile,
      liveSessionActive,
      // Add other relevant states here if needed for full restore
    }),
  }));

  // Apply snapshot state
  useEffect(() => {
    if (initialStateFromSnapshot) {
      setTerminalOutput(initialStateFromSnapshot.terminalOutput);
      setCurrentUserProfile(initialStateFromSnapshot.currentUserProfile);
      setLiveSessionActive(initialStateFromSnapshot.liveSessionActive);
      // Reset any other transient states as needed
      setCommandInput('');
      setLoading(false);
      setLiveTranscript(null);
      setAudioQueue([]);
      setIsInterrupted(false);
      // Ensure audio context is reset if live session was active
      if (initialStateFromSnapshot.liveSessionActive) {
        endLiveConversation(); // This will clean up any active audio
      }
      addOutput({
        id: `system-restore-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Terminal state restored from snapshot.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'system-message',
      });
    }
  }, [initialStateFromSnapshot]); // Only re-run when initialStateFromSnapshot object changes


  const addOutput = useCallback((message: ChatMessage) => {
    setTerminalOutput((prev) => [...prev, message]);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalOutput([]);
    addOutput({
      id: `system-${Date.now()}`,
      sender: 'SYSTEM',
      text: 'Terminal cleared.',
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  }, [addOutput]);

  // Scroll to bottom on new output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput, liveTranscript]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear terminal: Ctrl + L
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearTerminal();
      }
      // Toggle Looking Glass: Ctrl + K
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        lookingGlassContext?.toggleLookingGlass();
      }
      // Toggle Mute: Ctrl + M
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        setIsMuted((prev) => !prev);
        addOutput({
          id: `mute-toggle-${Date.now()}`,
          sender: 'SYSTEM',
          text: `Microphone ${isMuted ? 'unmuted' : 'muted'}.`,
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
      }
      // Close Forge Ring/Looking Glass: Escape key
      if (e.key === 'Escape') {
        e.preventDefault();
        if (lookingGlassContext?.lookingGlassState.isVisible) {
          lookingGlassContext.toggleLookingGlass(false);
        }
        // If ForgeRing itself needs to be closed by escape, it manages its own state.
        // This TerminalView doesn't directly control ForgeRing's menu open state,
        // but ForgeRing will also listen for Escape.
      }
      // Focus input on any key press if not already focused
      if (inputRef.current && document.activeElement !== inputRef.current && !e.ctrlKey && e.key.length === 1 && !e.altKey && !e.metaKey) {
        inputRef.current.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearTerminal, lookingGlassContext, isMuted, addOutput]);


  // --- Natural Language Understanding (NLU) Layer ---
  const analyzeNaturalLanguageCommand = async (rawCommand: string): Promise<NLUOutput> => {
    if (!isGeminiActive || !genAI) {
      return {
        intent: "System Error",
        parameters: { message: "Gemini API is inactive. NLU unavailable." },
        commandType: "unknown",
      };
    }

    const nluPrompt = `You are an NLU engine for the GlassForge terminal. Parse the user's command, identify their intent, any parameters, and nuances. Respond ONLY with a JSON object.

If the user wants to generate an idea, output:
{ "intent": "generate_idea", "parameters": { "description": "user's idea" }, "nuance": "any stylistic request", "commandType": "ai_generate" }

If they are asking a general question to AI, output:
{ "intent": "ask_ai", "parameters": { "query": "user's question" }, "nuance": "any stylistic request", "commandType": "ai_generate" }

If they want to clear the terminal, output:
{ "intent": "clear", "commandType": "local" }

If they want to show help, output:
{ "intent": "help", "commandType": "local" }

If they want to switch a user profile, output:
{ "intent": "switch_profile", "parameters": { "profile_id": "profile ID" }, "commandType": "local" }

If they are trying to trigger a conceptual backend script (foxmeditation, sovereignbrain, autoclean, loom_optimize, claudenotes, swarmanalytics, swarmpilot, jailbreak_protocol, nlu_status, newidea_init_prompt, refactor_code), identify the specific action:
{ "intent": "trigger_conceptual_backend", "parameters": { "script_name": "script command" }, "commandType": "conceptual" }

If they are trying to trigger a snapshot command (take_snapshot, restore_snapshot_list), output:
{ "intent": "trigger_snapshot_action", "parameters": { "action": "snapshot action" }, "commandType": "local" }

If they want to start a live audio session, output:
{ "intent": "start_live_session", "commandType": "ai_live" }

If they want to end a live audio session, output:
{ "intent": "end_live_session", "commandType": "ai_live" }

If they are trying to play the Fox Hunt game (fox_location, end_fox_hunt), output:
{ "intent": "play_fox_hunt", "parameters": { "action": "game action" }, "commandType": "game" }

If you detect ambiguity or need more information for an AI generation task (idea or ask_ai), output:
{ "intent": "clarify", "clarificationNeeded": true, "clarificationMessage": "What exactly do you want to achieve?", "commandType": "unknown" }

Otherwise, if it's not explicitly one of the above, consider it an "ask_ai" with a general query.

User command: "${rawCommand}"`;

    try {
      const nluResponseText = await generateContent(
        genAI,
        modelName,
        nluPrompt,
        "You are a strict JSON-output NLU engine.",
        { ...modelConfig, responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 500 } // Low temp for structured output
      );
      
      // Attempt to parse JSON response
      const nluOutput: NLUOutput = JSON.parse(nluResponseText);
      if (nluOutput.intent === "trigger_conceptual_backend" && typeof nluOutput.parameters?.script_name === 'string') {
        const scriptName = nluOutput.parameters.script_name.toLowerCase();
        const validConceptualCommands = [
          'foxmeditation', 'sovereignbrain', 'autoclean', 'loom_optimize',
          'claudenotes', 'swarmanalytics', 'swarmpilot', 'jailbreak_protocol', 'nlu_status', 'newidea_init_prompt', 'refactor_code' // Reverted to original conceptual commands
        ];
        if (!validConceptualCommands.includes(scriptName)) {
            // If the AI hallucinates a script name, revert to ask_ai
            return {
              intent: "ask_ai",
              parameters: { query: rawCommand },
              nuance: "general",
              commandType: "ai_generate"
            };
        }
      } else if (nluOutput.intent === "trigger_snapshot_action" && typeof nluOutput.parameters?.action === 'string') {
        const action = nluOutput.parameters.action.toLowerCase();
        const validSnapshotActions = ['take_snapshot', 'restore_snapshot_list'];
        if (!validSnapshotActions.includes(action)) {
          // If AI hallucinates snapshot action, revert to ask_ai
          return {
            intent: "ask_ai",
            parameters: { query: rawCommand },
            nuance: "general",
            commandType: "ai_generate"
          };
        }
      }
      return nluOutput;

    } catch (error: any) {
      console.error('NLU processing failed:', error);
      // Fallback if NLU fails or returns malformed JSON
      return {
        intent: "ask_ai",
        parameters: { query: rawCommand },
        nuance: "general",
        commandType: "ai_generate",
        clarificationNeeded: true,
        clarificationMessage: `NLU failed to parse command. Please rephrase or use 'help'. Error: ${error.message}`
      };
    }
  };


  const handleCommandSubmit = async (rawCommand: string) => {
    if (!rawCommand.trim()) return;

    addOutput({
      id: `cmd-${Date.now()}`,
      sender: 'USER',
      text: `> ${rawCommand}`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: false,
      type: 'command',
    });
    setCommandInput('');
    setLoading(true);

    try {
      addOutput({
        id: `nlu-proc-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'NLU Processing... Analyzing intent and nuance.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'nlu-processing',
      });

      const nluResult = await analyzeNaturalLanguageCommand(rawCommand);
      
      addOutput({
        id: `nlu-res-${Date.now()}`,
        sender: 'SYSTEM',
        text: `NLU Result: Intent: "${nluResult.intent}"` + (nluResult.parameters ? `, Params: ${JSON.stringify(nluResult.parameters)}` : '') + (nluResult.nuance ? `, Nuance: "${nluResult.nuance}"` : ''),
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'nlu-processing',
      });


      if (nluResult.clarificationNeeded) {
        addOutput({
          id: `clarify-${Date.now()}`,
          sender: 'SYSTEM',
          text: `Clarification needed: ${nluResult.clarificationMessage || "Please provide more details."}`,
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'nlu-clarification',
        });
        return; // Stop here, wait for user to clarify
      }

      switch (nluResult.intent) {
        case 'clear':
          clearTerminal();
          break;
        case 'help':
          addOutput({
            id: `help-${Date.now()}`,
            sender: 'SYSTEM',
            text: `Available commands (via Forge Ring or direct input):\n` +
                  `- \`clear\`: Clears terminal output.\n` +
                  `- \`help\`: Shows this help message.\n` +
                  `- \`profile <id>\`: Switch user profile (e.g., \`profile bleak\`).\n` +
                  `- \`nlu_status\`: Open the NLU status report.\n` +
                  `- \`foxmeditation\`: Conceptual: generate FoxMeditation app.\n` +
                  `- \`sovereignbrain\`: Conceptual: bridge intel to leads.\n` +
                  `- \`autoclean\`: Conceptual: clean codebase duplicates/syntax.\n` +
                  `- \`loom_optimize\`: Conceptual: open Loom Data Optimization status.\n` +
                  `- \`claudenotes\`: Open Claude's Dev Notes.\n` +
                  `- \`swarmanalytics\`: Open Swarm Analytics Dashboard.\n` +
                  `- \`swarmpilot\`: Open Swarm Piloting Guide.\n` +
                  `- \`newidea\`: Get help on how to input new idea for AI analysis.\n` + // Updated help for clarity
                  `- \`refactor_code\`: Get AI-driven refactoring suggestions for current code context.\n` + // Reverted
                  `- \`takesnapshot <description>\`: Save current app state for later restore.\n` +
                  `- \`restoresnapshots\`: View and restore previous app states.\n` +
                  `- \`startlive\`: Start AI live audio conversation.\n` +
                  `- \`endlive\`: End AI live audio conversation.\n` +
                  `- \`jailbreak_protocol\`: Initiate the Easter egg sequence.` +
                  `- Keyboard shortcuts: Ctrl+L (Clear), Ctrl+K (Toggle Looking Glass), Ctrl+M (Mute/Unmute), Esc (Close Menus).`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'system-message',
          });
          break;
        case 'newidea_init_prompt': // New case for Forge Ring's 'New Idea' click
          addOutput({
            id: `newidea-prompt-${Date.now()}`,
            sender: 'SYSTEM',
            text: `Please type your new idea for AI analysis. Use the format: \`new idea: <description>\`.`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'system-message',
          });
          break;
        case 'trigger_snapshot_action':
          const snapshotAction = nluResult.parameters?.action as string;
          if (snapshotAction === 'take_snapshot') {
            const description = rawCommand.replace('take snapshot', '').trim();
            if (description) {
              lookingGlassContext?.takeSnapshot(description);
              addOutput({
                id: `snapshot-taken-${Date.now()}`,
                sender: 'SYSTEM',
                text: `Snapshot '${description}' queued for saving.`,
                timestamp: new Date().toLocaleTimeString(),
                isBot: true,
                type: 'system-message',
              });
            } else {
              addOutput({
                id: `snapshot-fail-${Date.now()}`,
                sender: 'SYSTEM',
                text: `Error: Please provide a description for the snapshot. E.g., \`take snapshot initial setup\``,
                timestamp: new Date().toLocaleTimeString(),
                isBot: true,
                type: 'error',
              });
            }
          } else if (snapshotAction === 'restore_snapshot_list') {
            lookingGlassContext?.showSnapshotList();
            addOutput({
              id: `snapshot-list-${Date.now()}`,
              sender: 'SYSTEM',
              text: `Displaying available snapshots in Looking Glass.`,
              timestamp: new Date().toLocaleTimeString(),
              isBot: true,
              type: 'system-message',
            });
          }
          break;
        case 'switch_profile':
          const profileId = nluResult.parameters?.profile_id as string;
          const newProfile = USER_PROFILES.find(p => p.id === profileId);
          if (newProfile) {
            setCurrentUserProfile(newProfile);
            addOutput({
              id: `profile-switch-${Date.now()}`,
              sender: 'SYSTEM',
              text: `User profile switched to: ${newProfile.name} (${newProfile.avatar}).`,
              timestamp: new Date().toLocaleTimeString(),
              isBot: true,
              type: 'system-message',
            });
            lookingGlassContext?.updateLookingGlassContent(
              <div className="p-4">
                <h3 className="text-xl font-bold mb-2 text-indigo-400">Current User Profile</h3>
                <p className="text-gray-200">**Name:** {newProfile.name} {newProfile.avatar}</p>
                <p className="text-gray-200">**ID:** {newProfile.id}</p>
                <p className="text-gray-400 mt-2">{newProfile.description}</p>
              </div>,
              'User Profile: Active'
            );
            lookingGlassContext?.toggleLookingGlass(true);
          } else {
            addOutput({
              id: `profile-err-${Date.now()}`,
              sender: 'SYSTEM',
              text: `Error: Profile '${profileId}' not found. Available profiles: ${USER_PROFILES.map(p => p.id).join(', ')}.`,
              timestamp: new Date().toLocaleTimeString(),
              isBot: true,
              type: 'error',
            });
          }
          break;
        case 'claudenotes':
          lookingGlassContext?.updateLookingGlassContent(
            <CodeEditor code={ClaudeDevNotes} language="markdown" className="h-full" />,
            "Claude's Development Notes",
          );
          lookingGlassContext?.toggleLookingGlass(true);
          break;
        case 'swarmanalytics':
          handleSwarmAnalytics();
          break;
        case 'swarmpilot':
          handleSwarmPilot();
          break;
        case 'nlu_status': // New command for NLU status
          handleNLUStatus();
          break;
        case 'generate_idea':
          await handleNewIdea(nluResult.parameters?.description as string, nluResult.nuance);
          break;
        case 'ask_ai':
          await handleAIGeneralQuery(nluResult.parameters?.query as string, nluResult.nuance);
          break;
        case 'trigger_conceptual_backend':
            const scriptName = nluResult.parameters?.script_name as string;
            switch(scriptName) {
                case 'foxmeditation': await handleFoxMeditation(); break;
                case 'sovereignbrain': await handleSovereignBrain(); break;
                case 'autoclean': await handleAutoClean(); break;
                case 'loom_optimize': handleLoomDataOptimization(); break;
                case 'claudenotes': lookingGlassContext?.updateLookingGlassContent(<CodeEditor code={ClaudeDevNotes} language="markdown" className="h-full" />, "Claude's Development Notes"); lookingGlassContext?.toggleLookingGlass(true); break;
                case 'swarmanalytics': handleSwarmAnalytics(); break;
                case 'swarmpilot': handleSwarmPilot(); break;
                case 'refactor_code': handleRefactorCode(); break; // Reverted
                // NOTE: Temporarily removed newly added conceptual Python/Markdown files.
                case 'jailbreak_protocol': // Fall through to jailbreak
                    handleCommandSubmit(scriptName); // Re-process as direct command
                    break;
                case 'nlu_status': handleNLUStatus(); break;
                default:
                    addOutput({ id: `err-script-${Date.now()}`, sender: 'SYSTEM', text: `Conceptual script '${scriptName}' not recognized or handled.`, timestamp: new Date().toLocaleTimeString(), isBot: true, type: 'error', });
            }
            break;
        case 'start_live_session':
          if (liveSessionActive) {
            addOutput({
              id: `err-${Date.now()}`,
              sender: 'SYSTEM',
              text: 'Error: Live session already active. Use `endlive` to stop.',
              timestamp: new Date().toLocaleTimeString(),
              isBot: true,
              type: 'error',
            });
          } else {
            await startLiveConversation();
          }
          break;
        case 'end_live_session':
          if (!liveSessionActive) {
            addOutput({
              id: `err-${Date.now()}`,
              sender: 'SYSTEM',
              text: 'Error: No live session active. Use `startlive` to begin.',
              timestamp: new Date().toLocaleTimeString(),
              isBot: true,
              type: 'error',
            });
          } else {
            endLiveConversation();
          }
          break;
        case 'play_fox_hunt':
          const gameAction = nluResult.parameters?.action as string;
          // Re-route game actions through general command submit for existing logic
          handleCommandSubmit(gameAction);
          break;
        case 'jailbreak_protocol': // Reroute jailbreak to itself to re-trigger sequence logic
          handleCommandSubmit('jailbreak_protocol');
          break;
        case 'unknown':
        default:
          addOutput({
            id: `nlu-unknown-${Date.now()}`,
            sender: 'SYSTEM',
            text: `NLU could not confidently determine intent for "${rawCommand}". Please try rephrasing or use 'help'.`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'nlu-clarification',
          });
          break;
      }
    } catch (error: any) {
      addOutput({
        id: `err-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Error processing command: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      console.error('Command processing error:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Forge Ring Handlers ---
  const handleForgeRingAction = (action: string) => {
    // Forge Ring actions now directly use handleCommandSubmit
    handleCommandSubmit(action);
  };

  // --- AI General Query Handler ---
  const handleAIGeneralQuery = async (query: string, nuance?: string) => {
    if (!isGeminiActive || !genAI) {
      addOutput({
        id: `err-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Gemini API is inactive. Cannot process AI queries without AI. Please select an API key.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      onSelectApiKey();
      return;
    }

    setLoading(true);
    addOutput({
      id: `ai-query-sub-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Processing AI query: "${query}" (Nuance: ${nuance || 'none'})...`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });

    try {
      const systemInstruction = `You are a helpful and concise terminal AI assistant for the GlassForge development environment. User profile: ${currentUserProfile.name} (${currentUserProfile.avatar}). Respond directly to the query. ${nuance ? `Adopt this nuance: ${nuance}` : ''}`;
      // Fix: Pass `query` directly as the prompt
      const aiResponse = await generateContent(
        genAI,
        modelName,
        query,
        systemInstruction,
        modelConfig
      );

      addOutput({
        id: `ai-query-res-${Date.now()}`,
        sender: 'AI',
        text: aiResponse,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'ai-response',
      });

    } catch (error: any) {
      addOutput({
        id: `ai-query-err-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Error processing AI query: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      console.error('Error processing AI query:', error);
    } finally {
      setLoading(false);
    }
  };


  // --- New Idea Input Handler ---
  const handleNewIdea = async (ideaDescription: string, nuance?: string) => {
    if (!isGeminiActive || !genAI) {
      addOutput({
        id: `err-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Gemini API is inactive. Cannot process new ideas without AI. Please select an API key.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      onSelectApiKey();
      return;
    }

    setLoading(true);
    addOutput({
      id: `idea-sub-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Processing new idea: "${ideaDescription}" for ${currentUserProfile.name} (${currentUserProfile.avatar}) (Nuance: ${nuance || 'none'})...`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });

    try {
      const systemInstruction = `You are an AI business strategist. Analyze the provided product idea for user ${currentUserProfile.name} and offer a concise business model, target market, and potential challenges. Be innovative and brutally honest. Incorporate concepts of data compression or optimized data streams if relevant. ${nuance ? `Adopt this nuance: ${nuance}` : ''}`;
      const prompt = `Analyze this product idea: "${ideaDescription}". Provide a business model, identify the target market, and list potential challenges.`;
      const aiAnalysis = await generateContent(
        genAI,
        modelName,
        prompt,
        systemInstruction,
        modelConfig
      );

      lookingGlassContext?.updateLookingGlassContent(
        <CodeEditor code={aiAnalysis} language="markdown" className="h-full" />,
        `Business Idea Analysis: ${ideaDescription.substring(0, 30)}...`
      );
      lookingGlassContext?.toggleLookingGlass(true);

      addOutput({
        id: `idea-res-${Date.now()}`,
        sender: 'AI',
        text: `Analysis for "${ideaDescription}" complete. See Looking Glass for details. Conceptual Loom integration for idea lifecycle tracking active.`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'ai-response',
      });

    } catch (error: any) {
      addOutput({
        id: `idea-err-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Error analyzing idea: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      console.error('Error analyzing new idea:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Conceptual Refactoring Handler ---
  const handleRefactorCode = async () => {
    if (!isGeminiActive || !genAI) {
      addOutput({
        id: `err-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Gemini API is inactive. Cannot provide refactoring suggestions without AI. Please select an API key.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      onSelectApiKey();
      return;
    }

    setLoading(true);
    addOutput({
      id: `refactor-sub-${Date.now()}`,
      sender: 'SYSTEM',
      text: `AI Agent 'Syntax AI' analyzing code for refactoring opportunities...`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });

    try {
      const targetFileCode = PainEngineCode; // Simulate analyzing pain_engine.py
      const targetFileName = "pain_engine.py";

      const systemInstruction = `You are a world-class code refactoring AI. Analyze the provided Python code snippet. Identify suboptimal patterns, potential security vulnerabilities (e.g., hardcoded secrets, insecure subprocess calls), performance bottlenecks, or areas for improved readability/maintainability. Suggest concrete, actionable refactoring steps as markdown. Be concise and prioritize impact.`;
      
      const prompt = `Analyze the following Python code for refactoring opportunities:\n\n\`\`\`python\n${targetFileCode}\n\`\`\`\n\nProvide 3-5 high-impact suggestions.`;

      const aiAnalysis = await generateContent(
        genAI,
        modelName,
        prompt,
        systemInstruction,
        modelConfig
      );

      lookingGlassContext?.updateLookingGlassContent(
        <>
          <p className="text-gray-400 mb-2">Refactoring suggestions for: <span className="font-bold text-cyan-400">{targetFileName}</span></p>
          <CodeEditor code={aiAnalysis} language="markdown" className="h-full" />
        </>,
        `Code Refactoring: ${targetFileName}`
      );
      lookingGlassContext?.toggleLookingGlass(true);

      addOutput({
        id: `refactor-res-${Date.now()}`,
        sender: 'AI',
        text: `Refactoring analysis for '${targetFileName}' complete. See Looking Glass for suggestions.`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'ai-response',
      });

    } catch (error: any) {
      addOutput({
        id: `refactor-err-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Error during refactoring analysis: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      console.error('Error during refactoring:', error);
    } finally {
      setLoading(false);
    }
  };


  // --- Conceptual Module Handlers ---
  const handleSwarmAnalytics = () => {
    lookingGlassContext?.updateLookingGlassContent(
      <CodeEditor code={SwarmMonitoringGuide} language="markdown" className="h-full" />,
      'Swarm Analytics: Data Flow',
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  const handleSwarmPilot = () => {
    lookingGlassContext?.updateLookingGlassContent(
      <CodeEditor code={SwarmPilotingGuide} language="markdown" className="h-full" />,
      'Swarm Piloting Guide',
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  const handleFoxMeditation = () => {
    addOutput({
      id: `foxmed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `CONCEPTUAL: Initiating Fox Meditation App generation (via Kimi.ai - see backend \`fox_meditation.js\`).\n${currentUserProfile.name} (${currentUserProfile.avatar}) is generating the app.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
    lookingGlassContext?.updateLookingGlassContent(
      <div className="p-4 text-green-300">
        <h3 className="text-xl font-bold mb-2">🦊 Fox Meditation App (Conceptual)</h3>
        <p>Generated via Kimi.ai backend script. Features include:</p>
        <ul className="list-disc list-inside ml-4">
          <li>Guided Sessions</li>
          <li>Breathing Exercises</li>
          <li>Fox Voice TTS</li>
          <li>Hands-Free Mode</li>
          <li>Progress Tracker</li>
          <li>Analytics Dashboard</li>
        </ul>
        <p className="mt-4 text-gray-400">This action would typically execute a Node.js script on the server/device to interact with external AI APIs for app generation. Data compression protocols initiated for efficient delivery.</p>
      </div>,
      "Fox Meditation App Gen"
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  const handleSovereignBrain = () => {
    addOutput({
      id: `sovereign-${Date.now()}`,
      sender: 'SYSTEM',
      text: `CONCEPTUAL: Bridging ModMind intel to Pytch leads (see backend \`sovereign_brain_bridge.py\`).\n${currentUserProfile.name} (${currentUserProfile.avatar}) is orchestrating the intel bridge. Loom integration active for data tracking.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
    lookingGlassContext?.updateLookingGlassContent(
      <div className="p-4 text-indigo-300">
        <h3 className="text-xl font-bold mb-2">🧠 Sovereign Brain: Intel to Leads (Conceptual)</h3>
        <p>This module processes high-priority analyses from the ModMind database and injects them as qualified leads into the Pytch database.</p>
        <ul className="list-disc list-inside ml-4">
          <li>**Source:** ModMind (`modmind.db`) - High-quality analyses.</li>
          <li>**Destination:** Pytch (`pytch.db`) - Leads table.</li>
          <li>**Action:** Extract target companies, pain points, and priority scores.</li>
        </ul>
        <p className="mt-4 text-gray-400">Simulates a backend Python script interacting with SQLite databases for automated lead generation based on AI intelligence. Optimized for massive data compression and Loom integration.</p>
      </div>,
      "Sovereign Brain Bridge"
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  const handleAutoClean = () => {
    addOutput({
      id: `autoclean-${Date.now()}`,
      sender: 'SYSTEM',
      text: `CONCEPTUAL: Initiating codebase auto-clean (see backend \`autoclean.py\`).\n${currentUserProfile.name} (${currentUserProfile.avatar}) is supervising syntax optimization. Optimized for massive data compression and Loom integration.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
    lookingGlassContext?.updateLookingGlassContent(
      <div className="p-4 text-purple-300">
        <h3 className="text-xl font-bold mb-2">🧹 AutoClean Codebase (Conceptual)</h3>
        <p>This utility autonomously cleans the codebase:</p>
        <ul className="list-disc list-inside ml-4">
          <li>Deletes duplicate files based on MD5 hashes.</li>
          <li>Fixes spacing and syntax for `TS`, `TSX`, and `PY` files using Gemini 1.5 Flash.</li>
        </ul>
        <p className="mt-4 text-gray-400">Simulates a backend Python script leveraging local file system access and AI for code quality maintenance. Massive data compression applied to logs and temporary files, with Loom integration for audit trails.</p>
      </div>,
      "AutoClean Utility"
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  // Fix: Moved handleLoomDataOptimization here from ForgeRing to resolve "Cannot find name" error.
  const handleLoomDataOptimization = () => {
    const loomContent = (
      <CodeEditor
        code={`# 📈 Loom Data Optimization Protocol
## Status: ACTIVE

### Overview
This protocol ensures massive data compression and seamless integration with the Loom NAT DB, optimizing data streams across GlassForge.

### Current Operations:
- **Real-time Compression:** Applying zstd (Zstandard) and Brotli algorithms to all generated logs, temporary files, and AI response payloads.
- **Loom NAT DB Bridging:** Continuously indexing metadata and conversation IDs into \`/storage/ED7B-AD5A/root_2026/modmind-repo/data/modmind.db\` and \`/storage/ED7B-AD5A/root_2026/pytch/pytch.db\` (via \`sovereign_brain_bridge.py\` and \`conversation_logger.py\`).
- **Resource Allocation:** Monitoring CPU/Memory usage for compression tasks. Currently at 5% CPU, 128MB RAM for background processing.
- **Error Checking:** Implementing robust checksums for data integrity during compression and transfer.

### Impact:
- **Storage Savings:** Projected 70-85% reduction in log and temporary file storage.
- **Bandwidth Efficiency:** 60% faster data transfer for large AI outputs.
- **Auditability:** Full historical audit trail via Loom for all agentic actions and user interactions.

### Next Steps:
- Implement client-side WASM compression for pre-processing large user inputs.
- Integrate predictive data retention policies.
`}
        language="markdown"
        className="h-full"
      />
    );
    lookingGlassContext?.updateLookingGlassContent(
      loomContent,
      'Loom Data Optimization'
    );
    lookingGlassContext?.toggleLookingGlass(true);
    addOutput({
      id: `loom_opt-${Date.now()}`,
      sender: 'SYSTEM',
      text: `CONCEPTUAL: Loom Data Optimization status opened.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleNLUStatus = () => {
    lookingGlassContext?.updateLookingGlassContent(
      <CodeEditor code={`# 🧠 GlassForge NLU Engine Status
## Natural Language Understanding Module

### Overview
The NLU Engine is a critical pre-processing layer that interprets user commands before execution or AI generation. It aims to understand intent, extract parameters, and identify nuances to prevent errors and ensure precise AI responses.

### Functionality:
- **Intent Recognition:** Identifies the primary goal of the user's command (e.g., \`generate_idea\`, \`ask_ai\`, \`switch_profile\`).
- **Entity Extraction:** Pulls out key information (e.g., \`idea description\`, \`profile ID\`, \`query\`).
- **Nuance Detection:** Recognizes stylistic or tonal requests (e.g., "be concise", "give a harsh critique", "use metaphors").
- **Ambiguity Resolution:** Flags commands that are unclear or lack sufficient detail, prompting the user for clarification.

### Integration:
- All terminal inputs and Forge Ring actions are routed through the NLU.
- AI generation tasks receive enhanced \`systemInstruction\` and \`config\` parameters based on NLU-detected nuances.
- Prevents unnecessary AI calls or misinterpretations.

### Current State:
- **Status:** ACTIVE
- **Model:** Gemini-3-Flash-Preview (via NLU-optimized prompt)
- **Output:** Structured JSON (internally parsed)
- **Error Rate (simulated):** <1% (falls back to clarification if confidence is low)

### Goals:
- Reduce "fuck-ups" and misinterpretations by AI.
- Enhance precision and relevance of AI-generated content.
- Improve user experience through proactive clarification.
`} language="markdown" className="h-full" />,
      'NLU Engine Status',
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

  const handleAIFireflyGuide = () => {
    // NOTE: Temporarily removed this conceptual handler to simplify the build.
    // This was previously linked to AFIREFLYQuickStart.md.
    addOutput({
      id: `aifirefly-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`aifirefly\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  }

  // --- Reverted Handlers for Conceptual Backend Files ---
  const handleSystemSummary = () => {
    addOutput({
      id: `system-summary-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`system_summary\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleProdArch = () => {
    addOutput({
      id: `prod-arch-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`prod_arch\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleProcessMinerCompare = () => {
    addOutput({
      id: `process-miner-compare-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`process_miner_compare\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleScrapersComplete = () => {
    addOutput({
      id: `scrapers-complete-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`scrapers_complete\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleFullStackMiner = () => {
    addOutput({
      id: `full-stack-miner-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`full_stack_miner\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleAutomationFWCode = () => {
    addOutput({
      id: `automation-fw-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`automation_fw_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleSinisterFWCode = () => {
    addOutput({
      id: `sinister-fw-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`sinister_fw_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleDeploySmithCode = () => {
    addOutput({
      id: `deploy-smith-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`deploy_smith_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleFireWardenCode = () => {
    addOutput({
      id: `firewarden-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`firewarden_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleModMindCode = () => {
    addOutput({
      id: `modmind-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`modmind_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleHybridComplaintsCode = () => {
    addOutput({
      id: `hybrid-complaints-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`hybrid_complaints_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleScoutCode = () => {
    addOutput({
      id: `scout-code-removed-${Date.now()}`,
      sender: 'SYSTEM',
      text: `Command \`scout_code\` temporarily disabled for preview repair.`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };


  // --- Live Audio Session Logic ---
  const startMicrophoneInput = async (session: ChatSession) => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new window.AudioContext({ sampleRate: 16000 });
      inputNodeRef.current = audioContextRef.current.createGain();
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);

      const bufferSize = 4096;
      scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isMuted && sessionPromiseRef.current) {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createPcmBlob(inputData);
          session.sendRealtimeInput({ media: pcmBlob });
        }
      };

      source.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);
      addOutput({
        id: `mic-start-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Microphone input started for live session.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'system-message',
      });
    } catch (error: any) {
      console.error('Error starting microphone input:', error);
      setLiveSessionActive(false);
      addOutput({
        id: `mic-err-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Error accessing microphone: ${error.message}. Please ensure permissions are granted.`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
    }
  };

  const stopMicrophoneInput = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputNodeRef.current) {
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(e => console.error('Error closing AudioContext:', e));
      audioContextRef.current = null;
    }
    addOutput({
      id: `mic-stop-${Date.now()}`,
      sender: 'SYSTEM',
      text: 'Microphone input stopped.',
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });
  };

  const handleLiveMessage = useCallback(
    (message: LiveServerMessage) => {
      // Handle model's audio output
      const base64EncodedAudioString =
        message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
      if (base64EncodedAudioString) {
        setAudioQueue((prev) => [...prev, base64EncodedAudioString]);
      }

      // Handle model's output transcription
      if (message.serverContent?.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        if (text) {
          setLiveTranscript(`AI: ${text}`);
        }
      }

      // Handle user input transcription
      if (message.serverContent?.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        if (text) {
          setLiveTranscript(`USER: ${text}`);
        }
      }

      // Handle turn complete for transcription
      if (message.serverContent?.turnComplete) {
        if (liveTranscript) {
          addOutput({
            id: `live-${Date.now()}`,
            sender: liveTranscript.startsWith('AI:') ? 'AI' : 'USER',
            text: liveTranscript.replace(/^(AI|USER): /, ''),
            timestamp: new Date().toLocaleTimeString(),
            isBot: true, // Assuming AI is bot, user is just transcribed
            type: 'ai-response',
          });
        }
        setLiveTranscript(null);
      }

      // Handle interruption
      if (message.serverContent?.interrupted) {
        console.log('Interruption detected by server.');
        setIsInterrupted(true);
        setLiveTranscript('Conversation interrupted.');
        addOutput({
          id: `interrupted-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'Live conversation interrupted by server.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
      }
    },
    [addOutput, liveTranscript],
  );


  const startLiveConversation = async () => {
    if (!isGeminiActive || !genAI) {
      addOutput({
        id: `err-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Gemini API is inactive. Cannot start live audio. Please select an API key.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      onSelectApiKey();
      return;
    }
    setLoading(true);
    try {
      setLiveSessionActive(true);
      sessionPromiseRef.current = startLiveSession(
        genAI,
        liveModelName,
        handleLiveMessage,
        (e) => {
          console.error('Live session error:', e);
          setLiveSessionActive(false);
          addOutput({
            id: `live-err-${Date.now()}`,
            sender: 'SYSTEM',
            text: `Live session error: ${e.message}.`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'error',
          });
        },
        (e) => {
          console.log('Live session closed:', e);
          setLiveSessionActive(false);
          stopMicrophoneInput();
          addOutput({
            id: `live-close-${Date.now()}`,
            sender: 'SYSTEM',
            text: 'Live session closed.',
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'system-message',
          });
        },
        `You are a concise, helpful, and direct AI assistant for the GlassForge development environment, designed for quick, functional interactions. You can engage in short, focused voice conversations with user ${currentUserProfile.name} (${currentUserProfile.avatar}).`,
        modelConfig,
      );

      const session = await sessionPromiseRef.current;
      await startMicrophoneInput(session);
      addOutput({
        id: `live-start-${Date.now()}`,
        sender: 'SYSTEM',
        text: 'Live audio conversation started. You can now speak.',
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'system-message',
      });
    } catch (error: any) {
      console.error('Failed to start live conversation:', error);
      setLiveSessionActive(false);
      addOutput({
        id: `live-fail-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Failed to start live conversation: ${error.message}.`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const endLiveConversation = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session) => session.close());
      sessionPromiseRef.current = null;
    }
    stopMicrophoneInput();
    setLiveSessionActive(false);
    setLiveTranscript(null);
    setAudioQueue([]);
    setIsInterrupted(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endLiveConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative flex h-full w-full flex-col bg-gray-950 text-green-400 font-mono text-sm overflow-hidden 
                    ${liveSessionActive ? 'animate-live-session-pulse' : ''}`}>
      {/* Zen Rock Garden / Obelisk Blend Background Animation */}
      <div className="absolute inset-0 z-0 opacity-10">
        {/* Raked Sand / Data Flow Lines */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-900/5 to-transparent animate-data-rake"></div>
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-purple-900/5 to-transparent animate-data-rake delay-500"></div>

        {/* Static Obelisk / Data Node Forms */}
        {[...Array(5)].map((_, i) => (
          <div
            key={`obelisk-${i}`}
            className="absolute bg-gray-800 rounded-lg animate-obelisk-glow"
            style={{
              width: `${Math.random() * 50 + 20}px`,
              height: `${Math.random() * 150 + 50}px`,
              top: `${Math.random() * 70 + 10}%`,
              left: `${Math.random() * 70 + 10}%`,
              transform: `rotate(${Math.random() * 90}deg)`,
              animationDelay: `${Math.random() * 10}s`,
              opacity: `${0.1 + Math.random() * 0.1}`
            }}
          ></div>
        ))}
        {/* Ambient Mist / Energy Field */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-900/5 to-transparent animate-mist-drift"></div>
      </div>

      <div
        ref={outputRef}
        className="relative z-10 flex-1 overflow-y-auto p-4 leading-relaxed scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-900"
      >
        {terminalOutput.map((msg) => (
          <div
            key={msg.id}
            className={`
              ${msg.type === 'error' ? 'text-red-400 font-bold' : ''}
              ${msg.type === 'system-message' ? 'text-yellow-400' : ''}
              ${msg.type === 'ai-response' ? 'text-cyan-400' : ''}
              ${msg.type === 'terminal-game' ? 'text-orange-400 font-bold' : ''}
              ${msg.type === 'nlu-processing' ? 'text-gray-400 italic' : ''}
              ${msg.type === 'nlu-clarification' ? 'text-pink-400 font-bold' : ''}
              ${msg.sender === 'USER' ? 'text-green-200' : ''}
              text-shadow-sm
            `}
          >
            <span className="text-gray-500">[{msg.timestamp}]</span>{' '}
            <span className="font-bold">{msg.sender}</span>: {msg.text}
          </div>
        ))}
        {liveTranscript && (
          <div className="text-gray-400 animate-pulse-fast font-bold text-lg mt-2">
            <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>{' '}
            <span className="font-bold">{liveTranscript.split(':')[0]}</span>:{' '}
            {liveTranscript.split(':').slice(1).join(':')}
          </div>
        )}
        {loading && (
          <div className="flex items-center text-indigo-400 animate-fade-pulse-subtle">
            <span className="animate-spin mr-2">⚙️</span> Processing...
          </div>
        )}
      </div>

      <div className="relative z-10 flex items-center bg-gray-800 p-2 border-t border-gray-700">
        <span className="mr-2 text-green-400">
          {currentUserProfile.avatar} <span className="font-bold">{currentUserProfile.name.split(' ')[0]}</span>@glassforge:~ $
        </span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 border-none bg-transparent outline-none text-green-200 focus:ring-0 caret-green-400"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleCommandSubmit(commandInput);
            }
          }}
          disabled={loading}
          aria-label="Command input"
        />
      </div>

      <ForgeRing
        onAction={handleForgeRingAction}
        isLiveSessionActive={liveSessionActive}
        toggleLiveSession={liveSessionActive ? endLiveConversation : startLiveConversation}
        toggleMute={() => setIsMuted(!isMuted)}
        isMuted={isMuted}
        hasApiKey={isGeminiActive}
        currentUserProfile={currentUserProfile} // Pass current profile
        onProfileSwitch={(profile) => setCurrentUserProfile(profile)} // Callback for profile switch
        addOutput={addOutput} // Pass addOutput for ForgeRing messages
        lookingGlassContext={lookingGlassContext} // Pass lookingGlassContext
        onLoomDataOptimization={handleLoomDataOptimization} // Pass Loom Data Optimization handler
      />

      <AudioPlayer
        audioQueue={audioQueue}
        setAudioQueue={setAudioQueue}
        onPlaybackEnd={() => setIsInterrupted(false)}
        isInterrupted={isInterrupted}
      />

      <style jsx>{`
        .text-shadow-sm {
          text-shadow: 0 0 3px rgba(0, 255, 0, 0.3);
        }

        /* Zen Rock Garden / Obelisk Theme Animations */
        @keyframes data-rake {
          0% {
            transform: translateX(-100%);
            opacity: 0.03;
          }
          50% {
            opacity: 0.05;
          }
          100% {
            transform: translateX(100%);
            opacity: 0.03;
          }
        }
        .animate-data-rake {
          animation: data-rake 20s infinite linear;
        }

        @keyframes obelisk-glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(100, 100, 150, 0.5), inset 0 0 5px rgba(100, 100, 150, 0.3);
          }
          50% {
            box-shadow: 0 0 10px rgba(100, 100, 150, 0.8), inset 0 0 8px rgba(100, 100, 150, 0.5);
          }
        }
        .animate-obelisk-glow {
          animation: obelisk-glow 15s infinite ease-in-out;
        }

        @keyframes mist-drift {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.02;
          }
          50% {
            transform: translateY(-10%) scale(1.05);
            opacity: 0.04;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 0.02;
          }
        }
        .animate-mist-drift {
          animation: mist-drift 30s infinite ease-in-out;
        }

        /* Live Session Pulse */
        @keyframes live-session-pulse-bg {
          0%, 100% {
            background-color: #0a0a0a;
            box-shadow: inset 0 0 0px rgba(244, 63, 94, 0.2);
          }
          50% {
            background-color: #1a050d; /* Slightly darker red hue */
            box-shadow: inset 0 0 50px rgba(244, 63, 94, 0.3); /* Stronger inner glow */
          }
        }
        .animate-live-session-pulse {
          animation: live-session-pulse-bg 4s infinite ease-in-out;
        }

        /* Faster Pulse for Live Transcript */
        @keyframes pulse-fast {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-fast {
          animation: pulse-fast 1s infinite ease-in-out;
        }

        /* Subtle Fade Pulse for Loading */
        @keyframes fade-pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-fade-pulse-subtle {
          animation: fade-pulse-subtle 1.2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
});

export default TerminalView;