import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Mic, MicOff, Camera, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { chatApi, cardsApi } from '../utils/api';
import type { ChatMessage, ChatPageContext, TCGCard } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

interface Props {
  pageContext?: ChatPageContext;
}

export function ChatModal({ pageContext }: Props) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [listening, setListening] = useState(false);
  const [cardCache, setCardCache] = useState<Record<string, TCGCard>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // keyed by assistant message index → 1 (up) | -1 (down)
  const [feedback, setFeedback]   = useState<Record<number, 1 | -1>>({});

  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const fetchCards = useCallback(async (cardIds: string[]) => {
    const missing = cardIds.filter(id => !cardCache[id]);
    if (!missing.length) return;
    const results = await Promise.allSettled(missing.map(id => cardsApi.getCard(id)));
    const updates: Record<string, TCGCard> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') updates[missing[i]] = (r.value as { data: TCGCard }).data;
    });
    setCardCache(prev => ({ ...prev, ...updates }));
  }, [cardCache]);

  const send = useCallback(async (text: string, imgBase64?: string) => {
    if (!text.trim() && !imgBase64) return;
    const userMsg: ChatMessage = { role: 'user', content: text, imagePreview: imgBase64 };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setImagePreview(null);
    setLoading(true);

    try {
      const messageToSend = imgBase64
        ? `${text}\n\n[Image attached — please identify this card if visible]`
        : text;
      const res = await chatApi.send(messageToSend, pageContext);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.reply,
        cardIds: res.cardIds,
        intent: res.intent,
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (res.cardIds?.length) fetchCards(res.cardIds);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [pageContext, fetchCards]);

  const submitFeedback = useCallback(async (assistantIdx: number, rating: 1 | -1) => {
    if (feedback[assistantIdx] !== undefined) return; // already rated
    setFeedback(prev => ({ ...prev, [assistantIdx]: rating }));

    const assistantMsg = messages[assistantIdx];
    // find the user message immediately preceding this assistant message
    const userMsg = messages.slice(0, assistantIdx).reverse().find(m => m.role === 'user');

    try {
      await chatApi.feedback({
        message:     userMsg?.content ?? '',
        reply:       assistantMsg.content,
        rating,
        pageContext:  pageContext as object | undefined,
        intent:      assistantMsg.intent,
      });
    } catch {
      // feedback failure is silent — don't disrupt the conversation
    }
  }, [messages, feedback, pageContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input, imagePreview ?? undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input, imagePreview ?? undefined);
    }
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous    = false;
    recognition.interimResults = false;
    recognition.onresult = (e: AnySpeechRecognition) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const capturePhoto = async () => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      setImagePreview(base64);
      inputRef.current?.focus();
    } catch {
      // camera denied or unavailable
    } finally {
      stream?.getTracks().forEach(t => t.stop());
    }
  };

  const renderMessage = (msg: ChatMessage, i: number) => {
    const isUser = msg.role === 'user';

    if (isUser) {
      return (
        <div key={i} className="flex justify-end mb-3">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed bg-blue-600 text-white">
            {msg.imagePreview && (
              <img
                src={`data:image/jpeg;base64,${msg.imagePreview}`}
                alt="captured"
                className="rounded-lg mb-2 max-h-32 object-contain"
              />
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      );
    }

    const rated = feedback[i];
    return (
      <div key={i} className="flex justify-start mb-1">
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-white border border-gray-200 text-gray-800 shadow-sm">
            {msg.imagePreview && (
              <img
                src={`data:image/jpeg;base64,${msg.imagePreview}`}
                alt="captured"
                className="rounded-lg mb-2 max-h-32 object-contain"
              />
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
            {msg.cardIds && msg.cardIds.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {msg.cardIds.map(id => {
                  const card = cardCache[id];
                  return card ? (
                    <img
                      key={id}
                      src={card.images.small}
                      alt={card.name}
                      title={`${card.name} — ${card.set.name}`}
                      className="h-20 rounded-lg flex-shrink-0 shadow-md hover:scale-105 transition-transform cursor-pointer"
                    />
                  ) : (
                    <div key={id} className="h-20 w-14 rounded-lg bg-gray-100 flex-shrink-0 animate-pulse" />
                  );
                })}
              </div>
            )}
          </div>

          {/* Feedback row */}
          <div className="flex items-center gap-1 mt-1 ml-1">
            <button
              onClick={() => submitFeedback(i, 1)}
              disabled={rated !== undefined}
              aria-label="Helpful"
              className={`p-1 rounded-lg transition-colors ${
                rated === 1
                  ? 'text-green-600'
                  : rated !== undefined
                    ? 'text-gray-300 cursor-default'
                    : 'text-gray-300 hover:text-green-500 hover:bg-green-50'
              }`}
            >
              <ThumbsUp size={13} />
            </button>
            <button
              onClick={() => submitFeedback(i, -1)}
              disabled={rated !== undefined}
              aria-label="Not helpful"
              className={`p-1 rounded-lg transition-colors ${
                rated === -1
                  ? 'text-red-500'
                  : rated !== undefined
                    ? 'text-gray-300 cursor-default'
                    : 'text-gray-300 hover:text-red-400 hover:bg-red-50'
              }`}
            >
              <ThumbsDown size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Open AI chat"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col w-[360px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} />
          <span className="font-semibold text-sm">Pokédex AI</span>
        </div>
        <button onClick={() => setOpen(false)} className="hover:bg-blue-500 rounded-lg p-1 transition-colors" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8 px-4">
            <p className="font-medium text-gray-500 mb-1">Ask me anything about your collection</p>
            <p className="text-xs">Try: "What fire type cards do I own?" or "Which sets am I closest to completing?"</p>
          </div>
        )}
        {messages.map(renderMessage)}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
              <Loader2 size={16} className="animate-spin text-blue-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-3 pt-2 flex-shrink-0 flex items-center gap-2">
          <img src={`data:image/jpeg;base64,${imagePreview}`} alt="preview" className="h-12 rounded-lg object-contain border" />
          <button onClick={() => setImagePreview(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-100 px-3 py-2 flex items-end gap-2 bg-white">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your cards…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 max-h-24 overflow-y-auto"
          style={{ minHeight: '36px' }}
        />
        <button
          type="button"
          onClick={toggleVoice}
          className={`p-2 rounded-xl transition-colors flex-shrink-0 ${listening ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
          aria-label={listening ? 'Stop recording' : 'Voice input'}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          type="button"
          onClick={capturePhoto}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Capture card photo"
        >
          <Camera size={18} />
        </button>
        <button
          type="submit"
          disabled={loading || (!input.trim() && !imagePreview)}
          className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
