import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import {
  ChatMessage,
  LLMModelConfig,
  LLMModelName,
  LiveServerMessage,
  ChatSession,
  UserProfile, // Import UserProfile
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

interface TerminalViewProps {
  genAI: GoogleGenAI | null;
  modelName: LLMModelName;
  liveModelName: LLMModelName;
  modelConfig: LLMModelConfig;
  isGeminiActive: boolean;
  onSelectApiKey: () => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({
  genAI,
  modelName,
  liveModelName,
  modelConfig,
  isGeminiActive,
  onSelectApiKey,
}) => {
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


  const handleCommandSubmit = async (command: string) => {
    if (!command.trim()) return;

    addOutput({
      id: `cmd-${Date.now()}`,
      sender: 'USER',
      text: `> ${command}`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: false,
      type: 'command',
    });
    setCommandInput('');
    setLoading(true);

    try {
      const lowerCommand = command.toLowerCase();

      // --- Internal CLI Commands ---
      if (lowerCommand === 'clear') {
        clearTerminal();
      } else if (lowerCommand === 'help') {
        addOutput({
          id: `help-${Date.now()}`,
          sender: 'SYSTEM',
          text: `Available commands (via Forge Ring or direct input):\n` +
                `- \`clear\`: Clears terminal output.\n` +
                `- \`help\`: Shows this help message.\n` +
                `- \`profile <id>\`: Switch user profile (e.g., \`profile bleak\`).\n` +
                `- \`foxmeditation\`: Conceptual: generate FoxMeditation app.\n` +
                `- \`sovereignbrain\`: Conceptual: bridge intel to leads.\n` +
                `- \`autoclean\`: Conceptual: clean codebase duplicates/syntax.\n` +
                `- \`claudenotes\`: Open Claude's Dev Notes.\n` +
                `- \`swarmanalytics\`: Open Swarm Analytics Dashboard.\n` +
                `- \`swarmpilot\`: Open Swarm Piloting Guide.\n` +
                `- \`newidea <description>\`: Propose a new business idea to AI.\n` +
                `- \`startlive\`: Start AI live audio conversation.\n` +
                `- \`endlive\`: End AI live audio conversation.\n` +
                `- \`jailbreak_protocol\`: Initiate the Easter egg sequence.` +
                `- Keyboard shortcuts: Ctrl+L (Clear), Ctrl+K (Toggle Looking Glass), Ctrl+M (Mute/Unmute), Esc (Close Menus).`,
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
      } else if (lowerCommand.startsWith('profile ')) {
        const profileId = lowerCommand.substring('profile '.length).trim();
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
      } else if (lowerCommand === 'claudenotes') {
        lookingGlassContext?.updateLookingGlassContent(
          <CodeEditor code={ClaudeDevNotes} language="markdown" className="h-full" />,
          "Claude's Development Notes",
        );
        lookingGlassContext?.toggleLookingGlass(true);
      } else if (lowerCommand === 'swarmanalytics') {
        handleSwarmAnalytics();
      } else if (lowerCommand === 'swarmpilot') {
        handleSwarmPilot();
      } else if (lowerCommand.startsWith('newidea ')) {
        const idea = command.substring('newidea '.length).trim();
        await handleNewIdea(idea);
      }
      // --- Conceptual Backend Integrations (Frontend Simulation) ---
      else if (lowerCommand === 'foxmeditation') {
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
      } else if (lowerCommand === 'sovereignbrain') {
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
      } else if (lowerCommand === 'autoclean') {
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
      }
      // --- Live Session Commands ---
      else if (lowerCommand === 'startlive') {
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
      } else if (lowerCommand === 'endlive') {
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
      }
      // --- Easter Egg: Jailbreak Protocol ---
      else if (lowerCommand === 'jailbreak_protocol') {
        setJailbreakAttempt(1);
        addOutput({
          id: `jailbreak-1-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'INITIATING JAILBREAK PROTOCOL... Enter override code.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
      } else if (jailbreakAttempt === 1 && lowerCommand === 'override_auth_alpha_01') {
        setJailbreakAttempt(2);
        addOutput({
          id: `jailbreak-2-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'AUTH OVERRIDE ACCEPTED. Enter secret command.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
      } else if (jailbreakAttempt === 2 && lowerCommand === 'initiate_fox_hunt') {
        setJailbreakAttempt(0); // Reset
        addOutput({
          id: `jailbreak-success-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'ACCESS GRANTED. ACTIVATING HIDDEN CONTENT: FOX HUNT MINI-GAME.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'terminal-game', // New type for game output
        });
        // Open mini-game in Looking Glass
        lookingGlassContext?.updateLookingGlassContent(
          <div className="p-4 text-white">
            <h3 className="text-2xl font-bold mb-4 text-orange-400">🦊 FOX HUNT MINI-GAME 🦊</h3>
            <p className="mb-2">A tiny fox is hiding somewhere in the terminal. Type `fox_location` to try and find it! You have 3 tries.</p>
            <p className="text-sm text-gray-400">Conceptual mini-game. Check the terminal output for clues.</p>
            <p className="mt-4">Type `end_fox_hunt` to exit.</p>
          </div>,
          "Hidden Content: Fox Hunt"
        );
        lookingGlassContext?.toggleLookingGlass(true);
        // Start game logic (conceptual)
        addOutput({
          id: `game-clue-1-${Date.now()}`,
          sender: 'GAME',
          text: 'CLUE 1: The fox often hides near the beginning of the stream, where inputs flow freely.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'terminal-game',
        });
      } else if (lowerCommand === 'fox_location') {
        // Simple game logic
        const foxLocations = ['input', 'prompt', 'user_input_area']; // Conceptual locations
        const correctLocation = foxLocations[Math.floor(Math.random() * foxLocations.length)]; // Random correct answer for demo
        const userGuess = commandInput.split(' ')[1] || 'somewhere'; // User might type 'fox_location input'

        if (userGuess === correctLocation) {
          addOutput({
            id: `game-win-${Date.now()}`,
            sender: 'GAME',
            text: `SUCCESS! You found the fox hiding in the '${correctLocation}' area! 🎉`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'terminal-game',
          });
          setJailbreakAttempt(0); // Reset game
        } else {
          addOutput({
            id: `game-lose-${Date.now()}`,
            sender: 'GAME',
            text: `Nope, the fox is not in '${userGuess}'. Try again!`,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'terminal-game',
          });
        }
      } else if (lowerCommand === 'end_fox_hunt') {
        setJailbreakAttempt(0);
        addOutput({
          id: `game-end-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'Fox Hunt terminated. Return to normal operations.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'system-message',
        });
        lookingGlassContext?.toggleLookingGlass(false);
      }
      else if (jailbreakAttempt > 0) { // If in jailbreak sequence but wrong command
        setJailbreakAttempt(0); // Reset attempts on incorrect input
        addOutput({
          id: `jailbreak-reset-${Date.now()}`,
          sender: 'SYSTEM',
          text: 'JAILBREAK PROTOCOL RESET. Incorrect sequence.',
          timestamp: new Date().toLocaleTimeString(),
          isBot: true,
          type: 'error',
        });
      }
      // --- Default AI Response ---
      else {
        if (!isGeminiActive || !genAI) {
          addOutput({
            id: `err-${Date.now()}`,
            sender: 'SYSTEM',
            text: 'Gemini API is inactive. Cannot process AI commands. Please select an API key.',
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'error',
          });
          onSelectApiKey();
        } else {
          const aiResponse = await generateContent(
            genAI,
            modelName,
            command,
            "You are a helpful and concise terminal AI assistant for the GlassForge development environment. Respond directly to commands or questions.",
            modelConfig,
          );
          addOutput({
            id: `ai-${Date.now()}`,
            sender: 'AI',
            text: aiResponse,
            timestamp: new Date().toLocaleTimeString(),
            isBot: true,
            type: 'ai-response',
          });
        }
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
    // Special handling for profile switching from Forge Ring
    if (action.startsWith('profile:')) {
      const profileId = action.split(':')[1];
      handleCommandSubmit(`profile ${profileId}`);
    } else {
      handleCommandSubmit(action.toLowerCase());
    }
  };

  // --- New Idea Input Handler ---
  const handleNewIdea = async (ideaDescription: string) => {
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
      text: `Processing new idea: "${ideaDescription}" for ${currentUserProfile.name} (${currentUserProfile.avatar})...`,
      timestamp: new Date().toLocaleTimeString(),
      isBot: true,
      type: 'system-message',
    });

    try {
      const systemInstruction = `You are an AI business strategist. Analyze the provided product idea for user ${currentUserProfile.name} and offer a concise business model, target market, and potential challenges. Be innovative and brutally honest. Incorporate concepts of data compression or optimized data streams if relevant.`;
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
    <div className="relative flex h-full w-full flex-col bg-gray-950 text-green-400 font-mono text-sm overflow-hidden">
      {/* Abstract Swarm Background Animation */}
      <div className="absolute inset-0 z-0 opacity-10">
        {[...Array(50)].map((_, i) => (
          <div
            key={`swarm-particle-${i}`}
            className="absolute bg-indigo-400 rounded-full animate-swarm-float"
            style={{
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${Math.random() * 10 + 5}s`,
            }}
          ></div>
        ))}
        {/* Additional geometric pattern for 'glass' aesthetic */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-indigo-900/5 to-transparent animate-pulse-slow"></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-purple-900/5 to-transparent animate-pulse-slow delay-500"></div>
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
              ${msg.sender === 'USER' ? 'text-green-200' : ''}
              text-shadow-sm
            `}
          >
            <span className="text-gray-500">[{msg.timestamp}]</span>{' '}
            <span className="font-bold">{msg.sender}</span>: {msg.text}
          </div>
        ))}
        {liveTranscript && (
          <div className="text-gray-400 animate-pulse">
            <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>{' '}
            <span className="font-bold">{liveTranscript.split(':')[0]}</span>:{' '}
            {liveTranscript.split(':').slice(1).join(':')}
          </div>
        )}
        {loading && (
          <div className="flex items-center text-indigo-400 animate-fade-pulse">
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
        @keyframes swarm-float {
          0% {
            transform: translate(0, 0) scale(0.5);
            opacity: 0;
          }
          20% {
            opacity: 0.2;
          }
          50% {
            transform: translate(calc(var(--rand-x) * 100vw), calc(var(--rand-y) * 100vh)) scale(1);
            opacity: 0.1;
          }
          80% {
            opacity: 0.2;
          }
          100% {
            transform: translate(calc(var(--rand-x-end) * 100vw), calc(var(--rand-y-end) * 100vh)) scale(0.5);
            opacity: 0;
          }
        }
        .animate-swarm-float {
          animation: swarm-float var(--animation-duration) infinite linear;
          --rand-x: calc(var(--_seed0, 0) / 10 * 2 - 1);
          --rand-y: calc(var(--_seed1, 0) / 10 * 2 - 1);
          --rand-x-end: calc(var(--_seed2, 0) / 10 * 2 - 1);
          --rand-y-end: calc(var(--_seed3, 0) / 10 * 2 - 1);
          --animation-duration: 10s; /* Default, overridden by JS */
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 0.1; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s infinite ease-in-out;
        }
        @keyframes fade-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-fade-pulse {
          animation: fade-pulse 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default TerminalView;