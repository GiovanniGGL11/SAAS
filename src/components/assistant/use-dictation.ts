'use client';

import * as React from 'react';

/*
  Ditado pelo reconhecimento de fala do próprio navegador (Chrome, Edge, Safari). Só transforma
  fala em texto na caixa de mensagem: quem envia é sempre a pessoa, e o que o assistente fizer
  continua passando pela aprovação de sempre. No Chrome o áudio é processado pelo serviço de voz
  do navegador (Google); o Atendafy não grava nem guarda áudio.
*/

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'O navegador não liberou o microfone. Permita o acesso e tente de novo.',
  'service-not-allowed': 'O navegador não liberou o reconhecimento de voz.',
  'no-speech': 'Não ouvi nada. Tente de novo.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'Sem conexão com o serviço de voz do navegador.',
};

export function useDictation(onText: (text: string) => void) {
  const [supported] = React.useState(() => recognitionCtor() !== null);
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<Recognition | null>(null);
  const onTextRef = React.useRef(onText);
  React.useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  React.useEffect(() => () => ref.current?.abort(), []);

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor || listening) return;
    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) onTextRef.current(result[0].transcript.trim());
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted')
        setError(ERRORS[event.error] ?? 'O reconhecimento de voz falhou.');
    };
    recognition.onend = () => {
      setListening(false);
      ref.current = null;
    };
    ref.current = recognition;
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      ref.current = null;
      setError('Não foi possível iniciar o microfone.');
    }
  };
  const stop = () => ref.current?.stop();

  return { supported, listening, error, start, stop };
}
