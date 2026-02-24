import { useEffect, useRef, useState } from 'react';
import {
  Axe,
  Clover,
  Coins,
  Crown,
  Dices,
  FlaskConical,
  Gamepad2,
  Gem,
  Hammer,
  Heart,
  Key,
  Map,
  Puzzle,
  Flag,
  Scroll,
  Shield,
  Sparkles,
  Sword,
  TowerControl,
  Trophy,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const TEAM_ICONS = [
  { id: 'dices', label: 'Dice Set', Icon: Dices },
  { id: 'trophy', label: 'Trophy', Icon: Trophy },
  { id: 'crown', label: 'Crown', Icon: Crown },
  { id: 'shield', label: 'Shield', Icon: Shield },
  { id: 'sword', label: 'Sword', Icon: Sword },
  { id: 'axe', label: 'Axe', Icon: Axe },
  { id: 'hammer', label: 'Hammer', Icon: Hammer },
  { id: 'tower', label: 'Tower', Icon: TowerControl },
  { id: 'map', label: 'Treasure Map', Icon: Map },
  { id: 'scroll', label: 'Scroll', Icon: Scroll },
  { id: 'puzzle', label: 'Puzzle Piece', Icon: Puzzle },
  { id: 'gem', label: 'Gemstone', Icon: Gem },
  { id: 'coins', label: 'Coins', Icon: Coins },
  { id: 'flask', label: 'Alchemy Flask', Icon: FlaskConical },
  { id: 'heart', label: 'Heart', Icon: Heart },
  { id: 'key', label: 'Key', Icon: Key },
  { id: 'gamepad', label: 'Gamepad', Icon: Gamepad2 },
  { id: 'flag', label: 'Flag', Icon: Flag },
  { id: 'sparkles', label: 'Sparkles', Icon: Sparkles },
  { id: 'clover', label: 'Clover', Icon: Clover },
] as const;

export type TeamIconId = (typeof TEAM_ICONS)[number]['id'];
export type TeamIconValue = TeamIconId | string | undefined;

const TEAM_ICON_MAP: Record<TeamIconId, (typeof TEAM_ICONS)[number]> = TEAM_ICONS.reduce(
  (acc, icon) => {
    acc[icon.id] = icon;
    return acc;
  },
  {} as Record<TeamIconId, (typeof TEAM_ICONS)[number]>
);

export const isTeamIconId = (value: string | undefined): value is TeamIconId =>
  Boolean(value && TEAM_ICON_MAP[value as TeamIconId]);

interface TeamIconSelectorProps {
  value?: TeamIconValue;
  onChange: (icon: TeamIconId) => void;
  className?: string;
  disabled?: boolean;
}

export function TeamIconSelector({
  value,
  onChange,
  className,
  disabled = false,
}: TeamIconSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIcon = isTeamIconId(value) ? TEAM_ICON_MAP[value] : undefined;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (icon: TeamIconId) => {
    onChange(icon);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative inline-block', className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded border border-gold-2/30 bg-white/60 hover:bg-gold-2/10 transition-all',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'border-gold ring-1 ring-gold/20'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedIcon ? (
          <>
            <selectedIcon.Icon className="w-5 h-5 text-ink" aria-hidden="true" />
            <span className="sr-only">{selectedIcon.label}</span>
          </>
        ) : value ? (
          <span className="text-xl">{value}</span>
        ) : (
          <span
            className="w-5 h-5 rounded-full border border-gold-2/50 bg-white/60"
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 card-medieval p-3 z-[60] w-72 bg-white">
          <div className="mb-2 text-[11px] font-bold text-muted engraved uppercase tracking-wider">
            Team Icons
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TEAM_ICONS.map((option) => {
              const isActive = value === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={cn(
                    'h-12 w-12 rounded border border-transparent bg-white/70 hover:border-gold-2 hover:shadow-main flex items-center justify-center transition-all',
                    isActive && 'border-gold ring-1 ring-gold/30 bg-gold-2/15'
                  )}
                  aria-pressed={isActive}
                  aria-label={option.label}
                >
                  <option.Icon className="text-ink" strokeWidth={2} size={24} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted engraved leading-snug">
            Pick an icon for your team.
          </p>
        </div>
      )}
    </div>
  );
}

interface TeamIconBadgeProps {
  value?: TeamIconValue;
  size?: number;
  className?: string;
  muted?: boolean;
}

export function TeamIconBadge({ value, size = 24, className, muted = false }: TeamIconBadgeProps) {
  if (!value) return null;

  const icon = isTeamIconId(value) ? TEAM_ICON_MAP[value] : undefined;

  if (!icon) {
    return (
      <span className={cn('text-lg sm:text-xl', className)} aria-label="Team marker">
        {value}
      </span>
    );
  }

  const Icon = icon.Icon;

  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full', className)}
      title={icon.label}
    >
      <Icon
        className={cn(muted ? 'text-muted' : 'text-ink')}
        size={size}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="sr-only">{icon.label}</span>
    </span>
  );
}

export { TEAM_ICONS };

