import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { LookingGlassContext } from '../App';
import { UserProfile, ChatMessage } from '../types';
import { USER_PROFILES } from '../constants';
import CodeEditor from './CodeEditor';

interface ForgeRingProps {
  onAction: (action: string) => void;
  isLiveSessionActive: boolean;
  toggleLiveSession: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  hasApiKey: boolean;
  currentUserProfile: UserProfile;
  onProfileSwitch: (profile: UserProfile) => void;
  addOutput: (message: ChatMessage) => void; // For system messages
  lookingGlassContext: any; // Using any for simplicity with complex context type
}

interface MenuItem {
  name: string;
  action: string;
  color?: string;
  condition?: boolean;
  disabled?: boolean;
  lockedMessage?: string;
}

const ForgeRing: React.FC<ForgeRingProps> = ({
  onAction,
  isLiveSessionActive,
  toggleLiveSession,
  toggleMute,
  isMuted,
  hasApiKey,
  currentUserProfile,
  onProfileSwitch,
  addOutput,
  lookingGlassContext,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const ringRef = useRef<HTMLDivElement>(null);

  // Radial menu items
  const menuItems = useCallback((): MenuItem[] => {
    const commonItems: MenuItem[] = [
      { name: 'New Idea', action: 'newidea ', disabled: !hasApiKey, lockedMessage: "Requires active Gemini API." },
      { name: 'Swarm Analytics', action: 'swarmanalytics' },
      { name: 'Swarm Pilot', action: 'swarmpilot' },
      { name: 'Loom Data Opt.', action: 'loom_optimize', disabled: !hasApiKey, lockedMessage: "Requires active Gemini API." }, // New item
      { name: 'AutoClean', action: 'autoclean', disabled: !hasApiKey, lockedMessage: "Requires active Gemini API." },
      { name: 'Fox Meditation', action: 'foxmeditation', disabled: !hasApiKey, lockedMessage: "Requires active Gemini API." },
      { name: 'Sovereign Brain', action: 'sovereignbrain', disabled: !hasApiKey, lockedMessage: "Requires active Gemini API." },
      { name: 'Claude Notes', action: 'claudenotes' },
      { name: 'User Profile', action: 'userprofile' }, // New item
      { name: 'Help', action: 'help' },
      { name: 'Clear Terminal', action: 'clear' },
    ];

    const liveSessionItems: MenuItem[] = [
      {
        name: isLiveSessionActive ? (isMuted ? 'Unmute' : 'Mute') : 'Live Chat',
        action: isLiveSessionActive ? (isMuted ? 'unmute' : 'mute') : 'startlive',
        color: isLiveSessionActive ? (isMuted ? 'text-amber-400' : 'text-green-400') : 'text-rose-400',
        disabled: !hasApiKey, lockedMessage: "Requires active Gemini API."
      },
      {
        name: isLiveSessionActive ? 'End Live' : '',
        action: 'endlive',
        condition: isLiveSessionActive,
        color: 'text-red-400',
        disabled: !hasApiKey, lockedMessage: "Requires active Gemini API."
      }
    ].filter(item => item.name !== '' || (item.condition ?? false)); // Filter out 'End Live' if not active

    return [...commonItems, ...liveSessionItems];
  }, [isLiveSessionActive, isMuted, hasApiKey]);


  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      const maxX = window.innerWidth - (ringRef.current?.offsetWidth || 64);
      const maxY = window.innerHeight - (ringRef.current?.offsetHeight || 64);
      const boundedX = Math.min(Math.max(0, newX), maxX);
      const boundedY = Math.min(Math.max(0, newY), maxY);

      setPosition({ x: boundedX, y: boundedY });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Click handler for the ring itself (toggle menu)
  const handleRingClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      setIsMenuOpen((prev) => !prev);
    }
  }, [isDragging]);

  // Handle menu item clicks
  const handleMenuItemClick = useCallback((item: MenuItem) => {
    if (item.disabled) {
      addOutput({
        id: `locked-${Date.now()}`,
        sender: 'SYSTEM',
        text: `Command blocked: ${item.lockedMessage || 'Functionality is locked.'}`,
        timestamp: new Date().toLocaleTimeString(),
        isBot: true,
        type: 'error',
      });
      setIsMenuOpen(false);
      return;
    }

    if (item.action === 'startlive' || item.action === 'endlive') {
      toggleLiveSession();
    } else if (item.action === 'mute' || item.action === 'unmute') {
      toggleMute();
    } else if (item.action === 'userprofile') {
      handleUserProfileSelection();
    } else if (item.action === 'loom_optimize') {
      handleLoomDataOptimization();
    }
    else {
      onAction(item.action);
    }
    setIsMenuOpen(false);
  }, [onAction, toggleLiveSession, toggleMute, addOutput, lookingGlassContext]);


  // Close menu if clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ringRef.current && !ringRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [ringRef, isMenuOpen]);


  // --- Conceptual Handlers for new features ---
  const handleUserProfileSelection = () => {
    const profileContent = (
      <div className="p-4">
        <h3 className="text-xl font-bold mb-3 text-indigo-400">User Profile Management</h3>
        <p className="text-gray-300 mb-4">Current Profile: <span className="font-bold text-green-300">{currentUserProfile.name} {currentUserProfile.avatar}</span></p>
        <p className="text-gray-400 mb-2">Switch to another profile:</p>
        <ul className="list-disc list-inside ml-4">
          {USER_PROFILES.map(profile => (
            <li key={profile.id} className="mb-1">
              <button
                onClick={() => {
                  onProfileSwitch(profile);
                  lookingGlassContext?.toggleLookingGlass(false);
                  addOutput({
                    id: `profile-switch-lg-${Date.now()}`,
                    sender: 'SYSTEM',
                    text: `User profile switched to: ${profile.name} (${profile.avatar}).`,
                    timestamp: new Date().toLocaleTimeString(),
                    isBot: true,
                    type: 'system-message',
                  });
                }}
                className={`text-blue-400 hover:text-blue-200 transition ${currentUserProfile.id === profile.id ? 'font-bold text-green-400 cursor-default' : ''}`}
                disabled={currentUserProfile.id === profile.id}
              >
                {profile.name} {profile.avatar}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 mt-4">Profile switching affects AI context and simulated actions.</p>
      </div>
    );
    lookingGlassContext?.updateLookingGlassContent(
      profileContent,
      'User Profile: Configure'
    );
    lookingGlassContext?.toggleLookingGlass(true);
  };

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
  };


  return (
    <div
      ref={ringRef}
      className={`absolute z-40 p-1 rounded-full backdrop-blur-sm transition-all duration-200 ease-in-out
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        ${isMenuOpen ? 'bg-indigo-900 bg-opacity-70 ring-2 ring-indigo-500 shadow-lg' : 'bg-gray-800 bg-opacity-50 hover:bg-opacity-70 ring-1 ring-gray-600'}
        ${hasApiKey ? 'border-green-500' : 'border-red-500'}
        ${isLiveSessionActive ? 'animate-pulse-live-ring ring-4 ring-rose-500' : ''}
      `}
      style={{ left: position.x, top: position.y, width: 64, height: 64 }}
      onMouseDown={handleMouseDown}
      onClick={handleRingClick}
    >
      <div className={`relative w-full h-full flex items-center justify-center rounded-full
        bg-gradient-to-br from-indigo-700 to-purple-800 text-white font-bold text-xl
        border border-indigo-400 transition-all duration-200 ease-in-out
        ${isMenuOpen ? 'scale-110' : ''}
        ${isMuted ? 'bg-orange-700' : ''}
      `}>
        {isLiveSessionActive ? (isMuted ? '🔇' : '🎤') : (hasApiKey ? '🪨' : '🔑')}
      </div>

      {isMenuOpen && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] pointer-events-none">
          {menuItems().map((item, index) => {
            const angle = (index / menuItems().length) * 2 * Math.PI - Math.PI / 2;
            const radius = 120; // Distance from center
            const itemX = radius * Math.cos(angle);
            const itemY = radius * Math.sin(angle);

            return (
              <div
                key={item.name}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                style={{
                  left: `calc(50% + ${itemX}px)`,
                  top: `calc(50% + ${itemY}px)`,
                }}
              >
                <button
                  onClick={() => handleMenuItemClick(item)}
                  className={`px-4 py-2 rounded-full backdrop-blur-md transition-all duration-200 ease-in-out
                    bg-gray-700 bg-opacity-60 text-gray-200 text-sm font-semibold
                    hover:bg-opacity-90 hover:ring-1 hover:ring-indigo-400
                    ${item.color || ''}
                    ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  disabled={item.disabled}
                  title={item.disabled ? item.lockedMessage : item.name}
                >
                  {item.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse-live-ring {
          0%, 100% { box-shadow: 0 0 10px rgba(244, 63, 94, 0.7), 0 0 20px rgba(244, 63, 94, 0.4); }
          50% { box-shadow: 0 0 15px rgba(244, 63, 94, 1), 0 0 30px rgba(244, 63, 94, 0.6); }
        }
        .animate-pulse-live-ring {
          animation: pulse-live-ring 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default ForgeRing;