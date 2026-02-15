import React, { useState, useEffect, createContext, useCallback } from 'react';
import TerminalView from './views/TerminalView'; // New main view
import LookingGlass from './components/LookingGlass';
import { GoogleGenAI } from '@google/genai';
import {
  AppView,
  LookingGlassContextType,
  LookingGlassState,
} from './types';
import {
  INITIAL_LOOKING_GLASS_STATE,
  LLM_MODEL_CONFIG,
  LLM_MODEL_NAME,
  LLM_MODEL_NAME_LIVE,
} from './constants';
import LoadingSpinner from './components/LoadingSpinner';
import ApiKeyStatusIndicator from './components/ApiKeyStatusIndicator';

// Context for managing the Looking Glass visibility and content
export const LookingGlassContext =
  createContext<LookingGlassContextType | null>(null);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('splash');
  const [loading, setLoading] = useState(false);
  const [lookingGlassState, setLookingGlassState] = useState<LookingGlassState>(
    INITIAL_LOOKING_GLASS_STATE,
  );
  const [genAI, setGenAI] = useState<GoogleGenAI | null>(null);
  const [isApiKeySelected, setIsApiKeySelected] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
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

  const LookingGlassContextProviderValue: LookingGlassContextType = {
    lookingGlassState,
    updateLookingGlassContent,
    toggleLookingGlass,
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
            genAI={genAI}
            modelName={LLM_MODEL_NAME}
            liveModelName={LLM_MODEL_NAME_LIVE}
            modelConfig={LLM_MODEL_CONFIG}
            isGeminiActive={isGeminiActive}
            onSelectApiKey={handleSelectApiKey}
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