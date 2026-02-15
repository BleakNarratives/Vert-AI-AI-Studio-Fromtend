import React, { useState, useEffect, createContext, useCallback, useRef } from 'react';
import TerminalView from './views/TerminalView'; // New main view
import LookingGlass from './components/LookingGlass';
import { GoogleGenAI } from '@google/genai';
import {
  AppSnapshot,
  AppView,
  LookingGlassContextType,
  LookingGlassState,
  SnapshotListDisplayProps,
} from './types';
import {
  INITIAL_LOOKING_GLASS_STATE,
  LLM_MODEL_CONFIG,
  LLM_MODEL_NAME,
  LLM_MODEL_NAME_LIVE,
} from './constants';
import LoadingSpinner from './components/LoadingSpinner';
import ApiKeyStatusIndicator from './components/ApiKeyStatusIndicator';
import { LocalStorageSnapshotService } from './services/snapshotService'; // New import
import { v4 as uuidv4 } from 'uuid'; // For unique IDs

// Raw imports for conceptual file content snapshotting
import ClaudeDevNotes from './content/GlassForge_ModMind_DevNotes.md?raw';
import SwarmMonitoringGuide from './content/SWARM_MONITORING_README.md?raw';
import SwarmPilotingGuide from './content/SWARM_PILOTING_GUIDE.md?raw';
// Conceptual code files for snapshotting and simulated analysis (original set)
import PainEngineCode from './pain_engine.py?raw';
import ScraperCode from './scraper.py?raw';
import CelticLoomCompleteCode from './celtic_loom_complete.py?raw';

// NOTE: Temporarily removed newly added conceptual Python/Markdown files
// to simplify the build and focus on preview repair as per user request.


// Context for managing the Looking Glass visibility and content
export const LookingGlassContext =
  createContext<LookingGlassContextType | null>(null);

const snapshotService = new LocalStorageSnapshotService(); // Instantiate service

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('splash');
  const [loading, setLoading] = useState(false);
  const [lookingGlassState, setLookingGlassState] = useState<LookingGlassState>(
    INITIAL_LOOKING_GLASS_STATE,
  );
  const [genAI, setGenAI] = useState<GoogleGenAI | null>(null);
  const [isApiKeySelected, setIsApiKeySelected] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [snapshotToRestore, setSnapshotToRestore] = useState<AppSnapshot['terminalState'] | null>(null);
  const terminalRef = useRef<{ getTerminalState: () => AppSnapshot['terminalState'] }>(null); // Ref to get terminal state
  const currentUserProfileRef = useRef<any>(null); // To capture currentUserProfile from TerminalView

  const isGeminiActive = isApiKeySelected && genAI !== null;

  // --- Core API Key Management Functions ---

  const initGemini = useCallback(async () => {
    setLoading(true);
    setApiKeyError(null);
    try {
      if (typeof window.aistudio === 'undefined' || !window.aistudio.hasSelectedApiKey) {
        throw new Error(
          'AI Studio environment is not detected. Ensure `window.aistudio` is available for API key management.',
        );
      }
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsApiKeySelected(hasKey);

      if (hasKey) {
        const apiKey = process.env.API_KEY;
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.length < 30) {
          throw new Error("API_KEY environment variable is not set, is a placeholder, or is invalid.");
        }
        setGenAI(new GoogleGenAI({ apiKey }));
        console.log('Gemini API initialized successfully.');
      } else {
        console.warn('Gemini API Key not selected. AI features will be disabled.');
        setGenAI(null);
      }
    } catch (error: any) {
      console.error('Failed to initialize Gemini API:', error);
      const errorMessage = error.message.includes("API_KEY environment variable is not set") || error.message.includes("is a placeholder")
        ? "API Key missing or invalid. Please select a valid Gemini API key."
        : `Initialization failed: ${error.message}.`;
      setApiKeyError(errorMessage);
      setIsApiKeySelected(false);
      setGenAI(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectApiKey = useCallback(async () => {
    setLoading(true);
    setApiKeyError(null);
    try {
      if (typeof window.aistudio === 'undefined' || !window.aistudio.openSelectKey) {
        throw new Error(
          'AI Studio key selection functionality is not available.',
        );
      }
      await window.aistudio.openSelectKey();
      setIsApiKeySelected(true);
      await initGemini();
    } catch (error: any) {
      console.error('Error during API Key selection:', error);
      setApiKeyError(`Key selection failed: ${error.message}. Please select a valid API key from a paid GCP project (see ai.google.dev/gemini-api/docs/billing).`);
      setIsApiKeySelected(false);
      setGenAI(null);
    } finally {
      setLoading(false);
    }
  }, [initGemini]);

  useEffect(() => {
    initGemini();
  }, [initGemini]);

  // --- Looking Glass Context Functions ---

  const updateLookingGlassContent = useCallback((
    content: React.ReactNode,
    title: string,
  ) => {
    setLookingGlassState((prevState) => ({
      ...prevState,
      isVisible: true,
      content,
      title,
    }));
  }, []);

  const toggleLookingGlass = useCallback((isVisible?: boolean) => {
    setLookingGlassState((prevState) => ({
      ...prevState,
      isVisible: isVisible !== undefined ? isVisible : !prevState.isVisible,
    }));
  }, []);

  // --- Snapshot Management Functions ---

  const takeSnapshot = useCallback((description: string) => {
    const currentTerminalState = terminalRef.current?.getTerminalState();
    if (!currentTerminalState) {
      console.error("Terminal state not available for snapshot.");
      return;
    }

    const snapshot: AppSnapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      description,
      appState: {
        currentView,
        currentUserProfileId: currentTerminalState.currentUserProfile.id,
        lookingGlassState,
      },
      terminalState: currentTerminalState,
      conceptualFileContents: {
        'ClaudeDevNotes.md': ClaudeDevNotes,
        'SwarmMonitoringGuide.md': SwarmMonitoringGuide,
        'SwarmPilotingGuide.md': SwarmPilotingGuide,
        'pain_engine.py': PainEngineCode,
        'scraper.py': ScraperCode,
        'celtic_loom_complete.py': CelticLoomCompleteCode,
        // NOTE: Temporarily removed newly added conceptual Python/Markdown files
        // from snapshotting to simplify the build and focus on preview repair as per user request.
      },
    };
    snapshotService.saveSnapshot(snapshot);
    alert(`Snapshot '${description}' saved!`);
  }, [currentView, lookingGlassState]);

  const restoreSnapshot = useCallback((id: string) => {
    const snapshot = snapshotService.loadSnapshot(id);
    if (snapshot) {
      setCurrentView(snapshot.appState.currentView);
      // set currentUserProfile directly in TerminalView via prop
      setSnapshotToRestore(snapshot.terminalState);
      setLookingGlassState(snapshot.appState.lookingGlassState);
      toggleLookingGlass(false); // Close looking glass after restore
      alert(`Restored to snapshot: '${snapshot.description}'`);
    }
  }, [toggleLookingGlass]);

  const deleteSnapshot = useCallback((id: string) => {
    if (window.confirm('Are you sure you want to delete this snapshot?')) {
      snapshotService.deleteSnapshot(id);
      showSnapshotList(); // Refresh the list
    }
  }, []);

  const showSnapshotList = useCallback(() => {
    const snapshots = snapshotService.listSnapshots();
    const snapshotListContent = (
      <SnapshotListDisplay
        snapshots={snapshots}
        onRestore={restoreSnapshot}
        onDelete={deleteSnapshot}
      />
    );
    updateLookingGlassContent(snapshotListContent, 'Version Control: Snapshots');
    toggleLookingGlass(true);
  }, [updateLookingGlassContent, toggleLookingGlass, restoreSnapshot, deleteSnapshot]);


  const LookingGlassContextProviderValue: LookingGlassContextType = {
    lookingGlassState,
    updateLookingGlassContent,
    toggleLookingGlass,
    takeSnapshot,
    showSnapshotList,
    restoreSnapshot,
    deleteSnapshot,
  };

  if (loading && !apiKeyError && !isGeminiActive) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <LoadingSpinner message="Initializing AI services..." />
      </div>
    );
  }

  return (
    <LookingGlassContext.Provider value={LookingGlassContextProviderValue}>
      <div className="relative flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
        {currentView === 'splash' && (
          <div
            className="flex h-full w-full flex-col items-center justify-center bg-cover bg-center text-center"
            style={{
              backgroundImage:
                "url('https://picsum.photos/1920/1080?random=1')",
            }}
          >
            <div className="absolute inset-0 bg-black opacity-70"></div>
            <div className="relative z-10 p-4">
              <h1 className="mb-4 font-mono text-5xl font-bold text-green-400 md:text-7xl">
                VERTICAL AI
              </h1>
              <p className="mb-8 font-mono text-lg text-green-300 md:text-xl">
                GLASSFORGE.EXE V2.0
              </p>
              <p className="mb-12 max-w-2xl text-lg text-gray-200">
                The first post-desktop development environment.
                AI-native, swarm-based, local-first.
              </p>

              <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-3">
                <div className="transform rounded-lg border border-indigo-700 bg-indigo-900 bg-opacity-70 p-6 text-left shadow-lg backdrop-blur-sm transition duration-300 ease-in-out hover:scale-105 hover:border-indigo-500 hover:shadow-xl">
                  <h3 className="mb-2 text-2xl font-bold text-indigo-300">
                    AI NATIVE
                  </h3>
                  <p className="text-gray-300">
                    Built from the ground up with AI as the core.
                  </p>
                </div>
                <div className="transform rounded-lg border border-purple-700 bg-purple-900 bg-opacity-70 p-6 text-left shadow-lg backdrop-blur-sm transition duration-300 ease-in-out hover:scale-105 hover:border-purple-500 hover:shadow-xl">
                  <h3 className="mb-2 text-2xl font-bold text-purple-300">
                    SWARM DEVELOPMENT
                  </h3>
                  <p className="text-gray-300">
                    Specialized agents coordinate through immutable event logs.
                  </p>
                </div>
                <div className="transform rounded-lg border border-green-700 bg-green-900 bg-opacity-70 p-6 text-left shadow-lg backdrop-blur-sm transition duration-300 ease-in-out hover:scale-105 hover:border-green-500 hover:shadow-xl">
                  <h3 className="mb-2 text-2xl font-bold text-green-300">
                    LOCAL-FIRST
                  </h3>
                  <p className="text-gray-300">
                    Offline-capable, secure, and performant.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCurrentView('terminal')}
                className="relative z-10 mb-8 rounded-lg bg-gradient-to-r from-green-500 to-indigo-600 px-12 py-5 text-2xl font-bold text-white shadow-xl transition duration-300 ease-in-out hover:from-green-600 hover:to-indigo-700 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50"
              >
                ENTER GLASSFORGE →
              </button>

              <p className="mb-8 font-mono text-xl text-yellow-400">
                Forge the future. Code the impossible.
              </p>

              <div className="rounded-lg border border-red-700 bg-red-900 bg-opacity-70 p-6 text-left shadow-lg backdrop-blur-sm">
                <h3 className="mb-4 text-2xl font-bold text-red-300">
                  SYSTEM STATUS
                </h3>
                <ul className="text-lg text-gray-200">
                  <li className="mb-2">
                    <span className="text-green-400">✓</span> SWARM PROTOCOLS ACTIVE
                  </li>
                  <li className="mb-2">
                    <span className="text-green-400">✓</span> GOOGLE GEMINI / GENAI READY
                  </li>
                  <li className="mb-2">
                    <span className="text-green-400">✓</span> CELTIC KNOT ENCRYPTION ENABLED
                  </li>
                  <li>
                    <span className="text-green-400">✓</span> NOVA SYNC PROTOCOL ONLINE
                  </li>
                </ul>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 text-sm text-gray-600">
              © 2026 VERTICAL AI - GLASSFORGE
            </div>
            <div className="absolute bottom-4 right-4 flex gap-4 text-lg font-bold text-gray-500">
              <button className="px-4 py-2 opacity-50 transition-opacity hover:opacity-100">
                POWER
              </button>
              <button className="px-4 py-2 opacity-50 transition-opacity hover:opacity-100">
                VOLUME_DOWN
              </button>
            </div>
          </div>
        )}

        {currentView === 'terminal' && (
          <TerminalView
            ref={terminalRef}
            genAI={genAI}
            modelName={LLM_MODEL_NAME}
            liveModelName={LLM_MODEL_NAME_LIVE}
            modelConfig={LLM_MODEL_CONFIG}
            isGeminiActive={isGeminiActive}
            onSelectApiKey={handleSelectApiKey}
            initialStateFromSnapshot={snapshotToRestore} // Pass snapshot data
          />
        )}

        {lookingGlassState.isVisible && <LookingGlass />}

        <ApiKeyStatusIndicator
          isApiKeySelected={isApiKeySelected}
          apiKeyError={apiKeyError}
          onSelectApiKey={handleSelectApiKey}
          isLoading={loading}
        />
      </div>
    </LookingGlassContext.Provider>
  );
};

export default App;


// Placeholder component for rendering the list of snapshots
// This would be in its own file like components/SnapshotListDisplay.tsx
interface SnapshotListDisplayPropsInternal extends SnapshotListDisplayProps {}

const SnapshotListDisplay: React.FC<SnapshotListDisplayPropsInternal> = ({
  snapshots,
  onRestore,
  onDelete,
}) => {
  return (
    <div className="p-4">
      <h3 className="text-xl font-bold mb-4 text-indigo-400">Available Snapshots</h3>
      {snapshots.length === 0 ? (
        <p className="text-gray-400 italic">No snapshots saved yet.</p>
      ) : (
        <ul className="space-y-3">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center"
            >
              <div className="mb-2 md:mb-0">
                <p className="font-bold text-green-300">{snapshot.description}</p>
                <p className="text-xs text-gray-400">
                  ID: {snapshot.id.substring(0, 8)}... | Saved: {new Date(snapshot.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onRestore(snapshot.id)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => onDelete(snapshot.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};