import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SelectedGameCardProps {
  name: string;
  thumbnail?: string;
  year?: number;
  onClear?: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * SelectedGameCard - Display a selected game with thumbnail, name, year, and clear button
 * 
 * This component provides a consistent way to show selected games across the app.
 * It follows the Modern Medieval style guide with proper spacing, borders, and hover effects.
 * 
 * @param name - Game name (required)
 * @param thumbnail - Game thumbnail URL (optional)
 * @param year - Publication year (optional)
 * @param onClear - Callback when clear button is clicked (optional, hides button if not provided)
 * @param className - Additional CSS classes
 * @param disabled - Whether the card is disabled (no interactions)
 */
export function SelectedGameCard({
  name,
  thumbnail,
  year,
  onClear,
  className,
  disabled = false,
}: SelectedGameCardProps) {
  return (
    <div
      className={cn(
        'card-medieval bg-white/90 p-2.5 flex items-center gap-3 border-gold/40 h-14',
        !disabled && 'ring-1 ring-gold/10',
        className
      )}
    >
      {/* Game Thumbnail */}
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="w-9 h-9 rounded object-cover border border-border-2 shadow-sm shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-9 h-9 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-sm font-bold text-gold shrink-0">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}

      {/* Game Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-ink text-base leading-tight truncate">
          {name}
        </div>
        {year && (
          <div className="text-sm text-muted mt-0.5">
            {year}
          </div>
        )}
      </div>

      {/* Clear Button */}
      {onClear && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'shrink-0 w-8 h-8 rounded flex items-center justify-center',
            'text-muted hover:text-red-600 hover:bg-red-50',
            'transition-all focus:outline-none focus:ring-2 focus:ring-gold/50'
          )}
          aria-label="Clear game selection"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

