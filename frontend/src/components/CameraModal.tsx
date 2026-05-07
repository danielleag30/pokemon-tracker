import { useState, useRef } from 'react';
import { X, Camera, Loader, Plus, Minus, CheckCircle, RotateCcw } from 'lucide-react';
import { useAddCard } from '../hooks/useCollection';
import { cardsApi } from '../utils/api';
import type { TCGCard } from '../types';

interface Props {
  onClose: () => void;
}

type Phase = 'capture' | 'scanning' | 'results' | 'confirm';

interface Identified {
  name: string;
  setName: string | null;
  cardNumber: string | null;
}

function resizeImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

export function CameraModal({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('capture');
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [matchedCards, setMatchedCards] = useState<TCGCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [binderTag, setBinderTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addCard = useAddCard();

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const originalDataUrl = ev.target?.result as string;
      const resized = await resizeImage(originalDataUrl);
      setPreview(resized);
      setImageBase64(resized.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!imageBase64) return;
    setPhase('scanning');
    setError(null);

    try {
      const result = await cardsApi.scanCard(imageBase64, 'image/jpeg');
      setIdentified(result.identified);
      setMatchedCards(result.cards);
      if (result.cards.length === 1) {
        setSelectedCard(result.cards[0]);
        setPhase('confirm');
      } else {
        setPhase('results');
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to scan card. Please try again.');
      setPhase('capture');
    }
  };

  const handleAdd = async () => {
    if (!selectedCard) return;
    await addCard.mutateAsync({ cardId: selectedCard.id, quantity, binderTag: binderTag || undefined });
    setAdded(true);
    setTimeout(onClose, 1500);
  };

  const reset = () => {
    setPhase('capture');
    setPreview(null);
    setImageBase64(null);
    setIdentified(null);
    setMatchedCards([]);
    setSelectedCard(null);
    setQuantity(1);
    setBinderTag('');
    setError(null);
    setAdded(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Scan Card</h2>
          <div className="flex items-center gap-2">
            {phase !== 'capture' && (
              <button
                onClick={reset}
                title="Start over"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {phase === 'capture' && (
            <div className="flex flex-col items-center gap-5">
              {preview ? (
                <img
                  src={preview}
                  alt="Card preview"
                  className="max-h-64 rounded-xl shadow-lg object-contain"
                />
              ) : (
                <div className="w-full h-48 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Camera size={40} className="opacity-40" />
                  <p className="text-sm">Take a photo of your card</p>
                </div>
              )}
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCapture}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition-colors"
              >
                <Camera size={16} />
                {preview ? 'Retake Photo' : 'Take Photo'}
              </button>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="flex flex-col items-center gap-4 py-8">
              {preview && (
                <img
                  src={preview}
                  alt="Scanning"
                  className="max-h-48 rounded-xl shadow opacity-60 object-contain"
                />
              )}
              <div className="flex items-center gap-2 text-pokemon-blue font-semibold">
                <Loader size={18} className="animate-spin" />
                Identifying card with AI…
              </div>
            </div>
          )}

          {phase === 'results' && (
            <div className="space-y-4">
              {identified && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-blue-800">Identified: {identified.name}</p>
                  {identified.setName && <p className="text-blue-600">Set: {identified.setName}</p>}
                  {identified.cardNumber && <p className="text-blue-600">Number: {identified.cardNumber}</p>}
                </div>
              )}
              {matchedCards.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-sm">No matching cards found in the TCG database.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 font-medium">
                    {matchedCards.length} match{matchedCards.length !== 1 ? 'es' : ''} — select the right one:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {matchedCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => { setSelectedCard(card); setPhase('confirm'); }}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-gray-50 hover:bg-pokemon-blue/10 hover:ring-2 hover:ring-pokemon-blue transition-all"
                      >
                        <img src={card.images.small} alt={card.name} className="w-full rounded-lg shadow-sm" />
                        <div className="w-full text-left">
                          <p className="text-xs font-semibold text-gray-800 truncate">{card.name}</p>
                          <p className="text-xs text-gray-500 truncate">{card.set.name} · #{card.number}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'confirm' && selectedCard && (
            <div className="flex flex-col items-center gap-5">
              <img
                src={selectedCard.images.large}
                alt={selectedCard.name}
                className="w-40 rounded-xl shadow-lg"
              />
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-800">{selectedCard.name}</h3>
                <p className="text-sm text-gray-500">{selectedCard.set.name} · #{selectedCard.number}</p>
              </div>
              {added ? (
                <div className="flex items-center gap-2 text-green-600 font-semibold">
                  <CheckCircle size={18} /> Added to collection!
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Quantity</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-xl font-bold w-8 text-center">{quantity}</span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Binder Tag (optional)</label>
                    <input
                      type="text"
                      value={binderTag}
                      onChange={(e) => setBinderTag(e.target.value)}
                      placeholder="e.g. Binder 1"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          {phase === 'capture' && (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleScan}
                disabled={!imageBase64}
                className="px-5 py-2 bg-pokemon-blue text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Identify Card
              </button>
            </>
          )}
          {phase === 'results' && (
            <button onClick={onClose} className="ml-auto text-sm text-gray-500 hover:text-gray-800 transition-colors">
              Cancel
            </button>
          )}
          {phase === 'confirm' && !added && (
            <>
              <button
                onClick={() => setPhase(matchedCards.length > 1 ? 'results' : 'capture')}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleAdd}
                disabled={addCard.isPending}
                className="px-5 py-2 bg-pokemon-blue text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {addCard.isPending ? (
                  <><Loader size={14} className="animate-spin" /> Adding…</>
                ) : (
                  'Add to Collection'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
