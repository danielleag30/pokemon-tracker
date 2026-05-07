import { useState } from 'react';
import { Copy, Check, Users, X } from 'lucide-react';
import { getCollectionId, setCollectionId } from '../utils/api';
import { useQueryClient } from '@tanstack/react-query';

export function CollectionCode() {
  const [code, setCode] = useState(getCollectionId);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [input, setInput] = useState('');
  const qc = useQueryClient();

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apply = () => {
    const clean = input.trim().toUpperCase();
    if (!clean) return;
    setCollectionId(clean);
    setCode(clean);
    setShowModal(false);
    setInput('');
    // Invalidate all collection queries so they reload with the new ID
    qc.invalidateQueries({ queryKey: ['collection'] });
    qc.invalidateQueries({ queryKey: ['collection-stats'] });
  };

  return (
    <>
      <div className="px-3 py-3 border-t border-white/10">
        <p className="text-white/40 text-xs uppercase tracking-wide font-semibold mb-2">Collection Code</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 font-mono text-sm font-bold text-pokemon-yellow bg-white/10 rounded-lg px-2 py-1.5 tracking-widest">
            {code}
          </span>
          <button
            onClick={copy}
            title="Copy code"
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => { setInput(''); setShowModal(true); }}
            title="Switch collection"
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Users size={14} />
          </button>
        </div>
        <p className="text-white/30 text-xs mt-1.5 leading-tight">
          Share this code to sync across devices
        </p>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">Switch Collection</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700 leading-snug">
                <strong>Your current code is <span className="font-mono">{code}</span></strong>
                <br />Enter a different code to switch to another collection — useful for syncing across your devices or using a friend's shared code.
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Enter collection code</label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  placeholder="e.g. PIKA4729"
                  maxLength={12}
                  className="w-full font-mono border border-gray-200 rounded-xl px-3 py-2.5 text-sm tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
                  autoFocus
                />
              </div>

              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                <p><strong>To sync across your devices:</strong> copy your code above and enter it on each device.</p>
                <p><strong>For Brian:</strong> he'll get his own code automatically when he first visits. His collection stays separate.</p>
              </div>
            </div>

            <div className="flex gap-2 p-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={!input.trim()}
                className="flex-1 py-2 text-sm font-semibold bg-pokemon-blue text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
