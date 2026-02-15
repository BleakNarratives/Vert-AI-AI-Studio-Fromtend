import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ApiKeyStatusIndicatorProps {
  isApiKeySelected: boolean;
  apiKeyError: string | null;
  onSelectApiKey: () => void;
  isLoading: boolean;
}

const ApiKeyStatusIndicator: React.FC<ApiKeyStatusIndicatorProps> = ({
  isApiKeySelected,
  apiKeyError,
  onSelectApiKey,
  isLoading,
}) => {
  if (isLoading && !isApiKeySelected && !apiKeyError) {
    return (
      <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-gray-800 p-3 shadow-lg flex items-center space-x-2 text-yellow-400 text-sm">
        <LoadingSpinner message="" />
        <span>Initializing Gemini...</span>
      </div>
    );
  }

  if (!isApiKeySelected || apiKeyError) {
    const message = apiKeyError || "Gemini API Inactive";
    const statusColor = apiKeyError ? 'text-red-400' : 'text-yellow-400';
    const bgColor = apiKeyError ? 'bg-red-900' : 'bg-yellow-900';
    const ringColor = apiKeyError ? 'ring-red-500' : 'ring-yellow-500';

    return (
      <div className={`fixed bottom-4 left-4 z-50 rounded-lg p-3 shadow-lg ring-2 ${ringColor} ${bgColor} bg-opacity-80 backdrop-blur-sm flex items-center space-x-3`}>
        <span className={`text-xl ${statusColor}`}>⚠️</span>
        <div className="flex flex-col">
          <p className={`font-bold ${statusColor} text-sm`}>{message}</p>
          <p className="text-gray-300 text-xs">AI features disabled.</p>
        </div>
        <button
          onClick={onSelectApiKey}
          className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          aria-label="Select Gemini API Key"
        >
          Select Key
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-green-900 bg-opacity-80 backdrop-blur-sm p-3 shadow-lg ring-2 ring-green-500 flex items-center space-x-3">
      <span className="text-xl text-green-400">✅</span>
      <span className="font-bold text-green-400 text-sm">Gemini API Active</span>
    </div>
  );
};

export default ApiKeyStatusIndicator;
