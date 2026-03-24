/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { TwigLiveClient } from './lib/twig-live';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Rocket, Star, Globe, Zap } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState<{ text: string, isModel: boolean }[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const clientRef = useRef<TwigLiveClient | null>(null);
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startConversation = async () => {
    setIsConnecting(true);
    clientRef.current = new TwigLiveClient();
    
    await clientRef.current.connect({
      onOpen: () => {
        setIsConnected(true);
        setIsConnecting(false);
        // The model should start with the greeting based on system instructions
      },
      onClose: () => {
        setIsConnected(false);
        setIsConnecting(false);
      },
      onAudioData: (base64) => {
        audioQueue.current.push(base64);
        playNextInQueue();
      },
      onTranscription: (text, isModel) => {
        setTranscription(prev => [...prev.slice(-5), { text, isModel }]);
      },
      onError: (err) => {
        console.error("Twig Error:", err);
        setIsConnecting(false);
      }
    });
  };

  const stopConversation = () => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setTranscription([]);
  };

  const playNextInQueue = async () => {
    if (isPlaying.current || audioQueue.current.length === 0) return;
    
    isPlaying.current = true;
    const base64 = audioQueue.current.shift()!;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    
    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x7FFF;
      }
      
      const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      
      // Simple visualizer effect
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 50);

      source.onended = () => {
        isPlaying.current = false;
        clearInterval(interval);
        setAudioLevel(0);
        playNextInQueue();
      };
      
      source.start();
    } catch (err) {
      console.error("Playback error:", err);
      isPlaying.current = false;
      playNextInQueue();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Background Elements */}
      <div className="absolute top-10 left-10 opacity-20 orbit-animation">
        <Rocket size={48} className="text-space-orange" />
      </div>
      <div className="absolute bottom-20 right-20 opacity-10 scale-150">
        <Globe size={120} className="text-space-teal" />
      </div>
      {[...Array(20)].map((_, i) => (
        <Star 
          key={i} 
          size={Math.random() * 10 + 5} 
          className="absolute text-space-gold opacity-30"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
        />
      ))}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="retro-card w-full max-w-2xl flex flex-col items-center gap-8 relative z-10"
      >
        <div className="flex items-center gap-4">
          <Zap className="text-space-orange animate-pulse" />
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-space-orange uppercase">
            Twig
          </h1>
          <Zap className="text-space-orange animate-pulse" />
        </div>
        
        <p className="text-center text-lg opacity-80 max-w-md italic">
          "Your personal space-age guide to the world of Nicholas Loubser."
        </p>

        <div className="w-full h-48 bg-black/40 rounded-xl p-4 overflow-y-auto flex flex-col gap-2 border border-space-orange/20">
          <AnimatePresence>
            {transcription.length === 0 && !isConnecting && !isConnected && (
              <p className="text-space-cream/30 text-center mt-12">Waiting for transmission...</p>
            )}
            {isConnecting && (
              <p className="text-space-orange text-center mt-12 animate-bounce">Establishing Link...</p>
            )}
            {transcription.map((t, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: t.isModel ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-2 rounded-lg max-w-[80%] ${t.isModel ? 'bg-space-teal/30 self-start' : 'bg-space-orange/30 self-end'}`}
              >
                <span className="text-xs uppercase font-bold opacity-50 block mb-1">
                  {t.isModel ? 'Twig' : 'User'}
                </span>
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Audio Visualizer */}
        <div className="flex items-end gap-1 h-12 w-48">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ height: isConnected ? `${Math.max(10, audioLevel * Math.random())}%` : '10%' }}
              className="w-full bg-space-orange rounded-t-sm"
            />
          ))}
        </div>

        <div className="flex gap-4">
          {!isConnected ? (
            <button 
              onClick={startConversation}
              disabled={isConnecting}
              className="atomic-button flex items-center gap-2"
            >
              {isConnecting ? 'Connecting...' : <><Mic size={20} /> Initiate Contact</>}
            </button>
          ) : (
            <button 
              onClick={stopConversation}
              className="atomic-button bg-red-600 hover:bg-red-700 flex items-center gap-2"
            >
              <MicOff size={20} /> Terminate Link
            </button>
          )}
        </div>

        <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-4">
          Protocol: Gemini 2.5 Live | Sector: Nicholas Loubser
        </div>
      </motion.div>

      {/* Footer Branding */}
      <div className="mt-8 text-space-gold/50 text-sm font-medium uppercase tracking-widest">
        &copy; 1966 Space Age Technologies
      </div>
    </div>
  );
}
