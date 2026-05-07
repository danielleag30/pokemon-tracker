import { CardItem } from './CardItem';
import type { TCGCard, CollectionEntry } from '../types';

interface Props {
  cards: TCGCard[];
  collectionMap: Map<string, CollectionEntry>;
  binderTags?: string[];
  emptyMessage?: string;
}

export function CardGrid({ cards, collectionMap, binderTags = [], emptyMessage = 'No cards found.' }: Props) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-5xl mb-3">🃏</span>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <CardItem
          key={card.id}
          card={card}
          collectionEntry={collectionMap.get(card.id)}
          binderTags={binderTags}
        />
      ))}
    </div>
  );
}
