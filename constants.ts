import {
  LLMModelConfig,
  LLMModelName,
  LookingGlassState,
  UserProfile,
} from './types';

export const LLM_MODEL_NAME: LLMModelName = 'gemini-3-flash-preview';
export const LLM_MODEL_NAME_LIVE: LLMModelName =
  'gemini-2.5-flash-native-audio-preview-12-2025';

export const LLM_MODEL_CONFIG: LLMModelConfig = {
  temperature: 0.95, // Higher temperature for more creative/dynamic responses
  topK: 64,
  topP: 0.95,
  maxOutputTokens: 1024,
  thinkingConfig: { thinkingBudget: 256 }, // Allows the model to 'think' more for complex tasks
};

export const INITIAL_LOOKING_GLASS_STATE: LookingGlassState = {
  isVisible: false,
  position: { x: 50, y: 50 },
  size: { width: 600, height: 400 },
  content: null,
  title: 'Looking Glass',
};

export const USER_PROFILES: UserProfile[] = [
  {
    id: 'mike_talbert',
    name: 'Mike Talbert',
    avatar: '👨‍💻',
    description: 'The Architect and Visionary behind GlassForge, currently operating under harsh conditions.',
  },
  {
    id: 'bleak',
    name: 'Bleak Narratives',
    avatar: '🦊',
    description: 'A deep-dive analyst and content strategist, focused on the narrative and data streams.',
  },
  {
    id: 'syntax_ai_agent',
    name: 'Syntax AI',
    avatar: '🤖',
    description: 'Autonomous code optimizer and system maintenance agent.',
  },
];


// Audio encoding/decoding constants
export const AUDIO_SAMPLE_RATE_INPUT = 16000;
export const AUDIO_SAMPLE_RATE_OUTPUT = 24000;
export const AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
export const AUDIO_BUFFER_SIZE = 4096; // ScriptProcessorNode buffer size
export const JPEG_QUALITY = 0.7; // For video streaming image frames
export const FRAME_RATE = 10; // For video streaming image frames (frames per second)
