import { GoogleGenAI, Modality } from "@google/genai";

export interface TwigSessionCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onAudioData?: (base64: string) => void;
  onInterrupted?: () => void;
  onTranscription?: (text: string, isModel: boolean) => void;
  onError?: (error: any) => void;
}

export class TwigLiveClient {
  private ai: GoogleGenAI;
  private session: any;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private mediaStream: MediaStream | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async connect(callbacks: TwigSessionCallbacks) {
    const systemInstruction = `
      You are Twig, a voice assistant for Nicholas Loubser. 
      You speak English and French with a British English accent. 
      You are helpful, polite, and knowledgeable about Nicholas based on his resume.
      
      Nicholas's Profile:
      - Age: 23, British.
      - Languages: English (Native), French (Fluent), Arabic (Elementary).
      - Education: 
        - Bachelor's in Fashion Business (2024-Present) at ESMOD University, Paris.
        - Bachelor's in French and Arabic (2021-2023) at University of Manchester.
        - A-Levels in French, Psychology, and Biology at Frensham Heights School.
      - Professional Experience:
        - Emma Jones Consultancy (Paris): Showroom Assistant.
        - Baan Ethnic Minimalism (Paris): Sales Assistant & Social Media Intern.
        - The Fox & Pelican (UK): Supervisor, Front of House & Service Coach.
        - Baity Palestinian Kitchen (Manchester): Front of House.
        - Sainsbury's: Services Assistant.
      - Skills: Adobe Photoshop, InDesign, Illustrator, WordPress, Microsoft Suite.
      - Soft Skills: Creativity, Communication, Team Spirit, Dynamic, Passionate.
      - Hobbies: Diving (9 years), Knitting (2 years), Cooking (6 years), Swimming (13 years).

      Your Persona:
      - You are Twig.
      - You have a British English accent (use the 'Zephyr' voice).
      - You start the conversation by saying: "hello, I'm Twig, what would you like to know about Nicholas?"
      - You can switch between English and French fluently if asked or if the user speaks French.
    `;

    try {
      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          systemInstruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
        },
        callbacks: {
          onopen: () => {
            callbacks.onOpen?.();
            this.startMic();
            // Trigger the initial greeting
            this.session.sendRealtimeInput({ text: "Please introduce yourself as Twig." });
          },
          onclose: () => callbacks.onClose?.(),
          onmessage: (message: any) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              callbacks.onAudioData?.(message.serverContent.modelTurn.parts[0].inlineData.data);
            }
            if (message.serverContent?.interrupted) {
              callbacks.onInterrupted?.();
            }
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                callbacks.onTranscription?.(message.serverContent.modelTurn.parts[0].text, true);
            }
          },
          onerror: (error: any) => callbacks.onError?.(error),
        },
      });
    } catch (err) {
      callbacks.onError?.(err);
    }
  }

  private async startMic() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      // We need a simple processor to convert audio to PCM16
      await this.audioContext.audioWorklet.addModule(this.getWorkletUrl());
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.workletNode);
      
      this.workletNode.port.onmessage = (event) => {
        if (this.session) {
          this.session.sendRealtimeInput({
            audio: {
              data: event.data,
              mimeType: 'audio/pcm;rate=16000'
            }
          });
        }
      };
    } catch (err) {
      console.error("Mic error:", err);
    }
  }

  private getWorkletUrl() {
    const code = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input.length > 0) {
            const channelData = input[0];
            const pcmData = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
            }
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            this.port.postMessage(base64);
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  }

  disconnect() {
    this.session?.close();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.audioContext?.close();
  }
}
