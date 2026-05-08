import { TYPE_COLORS, TYPE_DISPLAY_NAMES } from '../utils/constants';

interface Props {
  type: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TypeBadge({ type, size = 'md' }: Props) {
  const colors = TYPE_COLORS[type] ?? { bg: '#999', text: '#fff', light: '#ddd' };
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1 text-sm font-semibold' : 'px-2 py-0.5 text-xs font-medium';

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} leading-tight`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {TYPE_DISPLAY_NAMES[type] ?? type}
    </span>
  );
}
