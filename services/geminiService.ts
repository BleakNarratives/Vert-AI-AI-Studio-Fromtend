import { GoogleGenAI, Modality } from '@google/genai';
import {
  Blob,
  ChatSession,
  LLMModelConfig,
  LLMModelName,
  LiveServerMessage,
  LLMResponseChunk,
} from '../types';
import {
  AUDIO_MIME_TYPE,
  AUDIO_SAMPLE_RATE_INPUT,
  AUDIO_SAMPLE_RATE_OUTPUT,
} from '../constants';

// --- Gemini Text/Streaming API interactions ---

/**
 * Generates content using the Gemini API.
 * @param genAI The initialized GoogleGenAI instance.
 * @param modelName The name of the Gemini model to use.
 * @param prompt The text prompt or content parts.
 * @param systemInstruction An optional system instruction.
 * @param config Optional model configuration.
 * @returns The generated content response.
 */
export async function generateContent(
  genAI: GoogleGenAI,
  modelName: LLMModelName,
  prompt: string,
  systemInstruction?: string,
  config?: LLMModelConfig,
): Promise<string> {
  try {
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        ...config,
      },
    });
    return response.text || 'No response generated.';
  } catch (error: any) {
    console.error('Error generating content:', error);
    if (error.message.includes('API key') || error.message.includes('UNAUTHENTICATED')) {
      throw new Error(
        'Gemini API Key issue: Ensure your API key is valid, selected, and has sufficient permissions/billing enabled.',
      );
    }
    if (error.message.includes('Requested entity was not found')) {
      throw new Error(
        'Gemini API Error: Model not found or unavailable. Please check the model name or API key.',
      );
    }
    throw new Error(`Failed to generate content: ${error.message}`);
  }
}

/**
 * Streams content using the Gemini API.
 * @param genAI The initialized GoogleGenAI instance.
 * @param modelName The name of the Gemini model to use.
 * @param prompt The text prompt or content parts.
 * @param systemInstruction An optional system instruction.
 * @param config Optional model configuration.
 * @returns An async iterator for content chunks.
 */
export async function* streamGenerateContent(
  genAI: GoogleGenAI,
  modelName: LLMModelName,
  prompt: string,
  systemInstruction?: string,
  config?: LLMModelConfig,
): AsyncGenerator<LLMResponseChunk> {
  try {
    const stream = await genAI.models.generateContentStream({
      model: modelName,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        ...config,
      },
    });

    for await (const chunk of stream) {
      yield chunk as LLMResponseChunk;
    }
  } catch (error: any) {
    console.error('Error streaming content:', error);
    if (error.message.includes('API key') || error.message.includes('UNAUTHENTICATED')) {
      throw new Error(
        'Gemini API Key issue: Ensure your API key is valid, selected, and has sufficient permissions/billing enabled.',
      );
    }
    if (error.message.includes('Requested entity was not found')) {
      throw new Error(
        'Gemini API Error: Model not found or unavailable. Please check the model name or API key.',
      );
    }
    throw new Error(`Failed to stream content: ${error.message}`);
  }
}

// --- Gemini Live API (Audio Streaming) interactions ---

// Utility functions for audio encoding/decoding
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function createPcmBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768; // Convert float to 16-bit PCM
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: AUDIO_MIME_TYPE, // 'audio/pcm;rate=16000'
  };
}

export async function decodeAudioDataToBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Establishes a real-time conversational session with the Gemini Live API.
 * @param genAI The initialized GoogleGenAI instance.
 * @param modelName The name of the Gemini Live model to use.
 * @param onMessage Callback for handling incoming messages from the server.
 * @param onError Callback for handling errors.
 * @param onClose Callback for handling session closure.
 * @param systemInstruction An optional system instruction for the AI.
 * @param config Optional model configuration.
 * @returns A promise that resolves to the chat session object.
 */
export async function startLiveSession(
  genAI: GoogleGenAI,
  modelName: LLMModelName,
  onMessage: (message: LiveServerMessage) => void,
  onError: (e: ErrorEvent) => void,
  onClose: (e: CloseEvent) => void,
  systemInstruction?: string,
  config?: LLMModelConfig,
): Promise<ChatSession> {
  try {
    const session = await genAI.live.connect({
      model: modelName,
      callbacks: {
        onopen: () => console.log('Gemini Live session opened.'),
        onmessage,
        onerror,
        onclose,
      },
      config: {
        responseModalities: [Modality.AUDIO], // Only audio responses for Live API
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }, // Default voice
        },
        systemInstruction,
        inputAudioTranscription: {}, // Enable transcription for user input
        outputAudioTranscription: {}, // Enable transcription for model output
        ...config,
      },
    });
    return session;
  } catch (error: any) {
    console.error('Error starting live session:', error);
    if (error.message.includes('API key') || error.message.includes('UNAUTHENTICATED')) {
      throw new Error(
        'Gemini API Key issue: Ensure your API key is valid, selected, and has sufficient permissions/billing enabled.',
      );
    }
    if (error.message.includes('Requested entity was not found')) {
      throw new Error(
        'Gemini Live API Error: Model not found or unavailable for live sessions. Please check the model name or API key.',
      );
    }
    if (error.message.includes('Failed to fetch')) {
      throw new Error(
        'Network Error: Could not connect to Gemini Live API. Check your internet connection.',
      );
    }
    throw new Error(`Failed to start live session: ${error.message}`);
  }
}