interface Props {
  value: number;
  max: number;
  color?: string;
  label?: string;
  showPercent?: boolean;
  height?: 'sm' | 'md' | 'lg';
}

export function ProgressBar({ value, max, color = '#3B4CCA', label, showPercent = true, height = 'md' }: Props) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const h = height === 'sm' ? 'h-1.5' : height === 'lg' ? 'h-4' : 'h-2.5';

  return (
    <div className="w-full">
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-gray-600 font-medium">{label}</span>}
          {showPercent && (
            <span className="text-xs font-bold" style={{ color }}>
              {value}/{max} ({pct}%)
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${h} overflow-hidden`}>
        <div
          className={`${h} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
