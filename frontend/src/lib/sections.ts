/**
 * The phone layout's grouping of pages. Two tabs hold several pages each:
 * Browse (every "By ___" view plus the Pokédex) and My Cards (the collection
 * plus Duplicates and Missing). Each keeps its pages at their existing URLs,
 * so links, bookmarks and the chat's page context are unchanged; the tab bar
 * and the pill row are just a different way to reach them.
 */
export interface SectionPage {
  to: string;
  label: string;
}

export const BROWSE_PAGES: SectionPage[] = [
  { to: '/sets',      label: 'Sets' },
  { to: '/series',    label: 'Series' },
  { to: '/starters',  label: 'Starters' },
  { to: '/type',      label: 'Types' },
  { to: '/evolution', label: 'Evolution' },
  { to: '/pokedex',   label: 'Pokédex' },
];

export const COLLECTION_PAGES: SectionPage[] = [
  { to: '/my-cards',   label: 'All Cards' },
  { to: '/duplicates', label: 'Duplicates' },
  { to: '/missing',    label: 'Missing' },
];

export function inSection(pages: SectionPage[], pathname: string): boolean {
  return pages.some((p) => pathname === p.to || pathname.startsWith(p.to + '/'));
}

/**
 * Last page visited inside each section, so tapping a tab returns to where
 * you were (as iOS tab bars do) rather than always to the first page.
 * Module state: it only needs to survive for the session.
 */
const lastVisited: Record<'browse' | 'collection', string> = {
  browse: BROWSE_PAGES[0].to,
  collection: COLLECTION_PAGES[0].to,
};

export function rememberSectionPage(section: 'browse' | 'collection', path: string) {
  lastVisited[section] = path;
}

export function sectionEntry(section: 'browse' | 'collection'): string {
  return lastVisited[section];
}
