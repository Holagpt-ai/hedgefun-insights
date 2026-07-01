import { useState, useRef, useCallback, useEffect } from "react";
import { getSpeechLang } from "@/lib/speechLangMap";

// Minimal shape of the Web Speech API's SpeechRecognition interface —
// not in standard TS lib.dom.d.ts, so declared locally.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type VoiceInputError = "not-allowed" | "network" | "service-not-allowed" | "unsupported" | "other";

interface UseVoiceInputOptions {
  language: string;
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ language, onTranscript }: UseVoiceInputOptions) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<VoiceInputError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionCtor);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setIsSupported(false);
      setError("unsupported");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = getSpeechLang(language);
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (e: SpeechRecognitionEventLike) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        onTranscript(text);
      };

      recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
        const known: VoiceInputError[] = ["not-allowed", "network", "service-not-allowed"];
        setError(known.includes(e.error as VoiceInputError) ? (e.error as VoiceInputError) : "other");
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setError(null);
      setIsListening(true);
      recognition.start();
    } catch {
      setError("other");
      setIsListening(false);
    }
  }, [language, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isSupported, isListening, error, startListening, stopListening };
}
