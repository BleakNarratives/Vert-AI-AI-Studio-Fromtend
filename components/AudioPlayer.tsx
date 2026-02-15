import React, { useRef, useEffect, useCallback } from 'react';
import { decodeAudioDataToBuffer, decode } from '../services/geminiService';
import { AUDIO_SAMPLE_RATE_OUTPUT } from '../constants';
import { AudioBufferSourceNodeExt } from '../types';

interface AudioPlayerProps {
  audioQueue: string[];
  setAudioQueue: React.Dispatch<React.SetStateAction<string[]>>;
  onPlaybackEnd: () => void;
  isInterrupted: boolean;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioQueue,
  setAudioQueue,
  onPlaybackEnd,
  isInterrupted,
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNodeExt>>(new Set());
  const outputNodeRef = useRef<GainNode | null>(null);

  // Initialize AudioContext and GainNode
  useEffect(() => {
    if (!audioContextRef.current) {
      // Ensure AudioContext is only created once
      audioContextRef.current = new window.AudioContext({
        sampleRate: AUDIO_SAMPLE_RATE_OUTPUT,
      });
      outputNodeRef.current = audioContextRef.current.createGain();
      outputNodeRef.current.connect(audioContextRef.current.destination);
    }

    return () => {
      // Clean up AudioContext on unmount
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().then(() => {
          audioContextRef.current = null;
          outputNodeRef.current = null;
          console.log('AudioContext closed on unmount.');
        }).catch(e => console.error('Error closing AudioContext:', e));
      }
    };
  }, []);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        console.warn('Error stopping audio source:', e);
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  useEffect(() => {
    if (isInterrupted) {
      console.log('Audio playback interrupted.');
      stopAllAudio();
      setAudioQueue([]); // Clear queue on interruption
      onPlaybackEnd(); // Signal that playback has ended due to interruption
    }
  }, [isInterrupted, stopAllAudio, setAudioQueue, onPlaybackEnd]);

  const playNextAudio = useCallback(async () => {
    if (audioQueue.length === 0 || !audioContextRef.current || !outputNodeRef.current) return;

    const currentAudioBlob = audioQueue[0];
    const audioContext = audioContextRef.current;
    const outputNode = outputNodeRef.current;

    try {
      const decodedBytes = decode(currentAudioBlob);
      const audioBuffer = await decodeAudioDataToBuffer(
        decodedBytes,
        audioContext,
        AUDIO_SAMPLE_RATE_OUTPUT,
        1,
      );

      const source = audioContext.createBufferSource() as AudioBufferSourceNodeExt;
      source.buffer = audioBuffer;
      source.connect(outputNode); // Connect to the shared outputNode

      // Schedule playback
      nextStartTimeRef.current = Math.max(
        nextStartTimeRef.current,
        audioContext.currentTime,
      );
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.add(source);

      source.addEventListener('ended', () => {
        activeSourcesRef.current.delete(source);
        // Remove the played audio from the queue and trigger next playback
        setAudioQueue((prevQueue) => prevQueue.slice(1));
        if (activeSourcesRef.current.size === 0 && audioQueue.length === 1) {
          onPlaybackEnd(); // Only call if this was the last audio in the original queue
        }
      });
    } catch (error) {
      console.error('Error decoding or playing audio chunk:', error);
      // Skip this chunk and try to play the next one
      setAudioQueue((prevQueue) => prevQueue.slice(1));
    }
  }, [audioQueue, setAudioQueue, onPlaybackEnd]);

  useEffect(() => {
    // Only attempt to play if there's audio in the queue and no active sources (to avoid overlapping)
    if (audioQueue.length > 0 && activeSourcesRef.current.size === 0 && audioContextRef.current?.state === 'running') {
      playNextAudio();
    }
  }, [audioQueue, playNextAudio]);

  // Handle AudioContext suspension/resumption on user interaction for mobile browsers
  useEffect(() => {
    const resumeAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('AudioContext resumed!');
          // Attempt to play if there's a queue
          if (audioQueue.length > 0 && activeSourcesRef.current.size === 0) {
            playNextAudio();
          }
        }).catch(e => console.error('Error resuming AudioContext:', e));
      }
    };

    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('keydown', resumeAudio, { once: true });

    return () => {
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
  }, [audioQueue, playNextAudio]);


  return null; // This component is headless, purely for audio management
};

export default AudioPlayer;