import { Heart, Edit2, Plus, Trophy, Gamepad2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { STATUS_LABELS, STATUS_COLORS } from '../../types/library';
import type { UserGame } from '../../types/library';
import type { UserGameStats } from '../../types/stats';
import { cn } from '../../utils/cn';

interface UserGamePanelProps {
  userGame: UserGame;
  gameStats: UserGameStats | null;
  onEditClick: () => void;
  onLogPlayClick: () => void;
}

export function UserGamePanel({
  userGame,
  gameStats,
  onEditClick,
  onLogPlayClick,
}: UserGamePanelProps) {
  const [showNotes, setShowNotes] = useState(false);

  const playCount = gameStats?.playCount ?? userGame.playCount ?? 0;
  const winCount = gameStats?.winCount ?? userGame.winCount ?? 0;
  const winRate = playCount > 0 ? Math.round((winCount / playCount) * 100) : 0;

  return (
    <div className="card-medieval p-5 space-y-4">
      {/* Status Row */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
            STATUS_COLORS[userGame.status]
          )}
        >
          {STATUS_LABELS[userGame.status]}
        </span>

        {userGame.favorite && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <Heart className="w-4 h-4 fill-current" />
            <span className="text-sm font-medium">Favorite</span>
          </span>
        )}

        {userGame.forTrade && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            For Trade
          </span>
        )}

        {userGame.forSale && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            For Sale
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onEditClick}>
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button variant="primary" size="sm" onClick={onLogPlayClick}>
            <Plus className="w-4 h-4 mr-1" />
            Log Play
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap gap-6 pt-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-gold" />
          <span className="text-sm">
            <span className="font-bold text-ink">{playCount}</span>{' '}
            <span className="text-muted">{playCount === 1 ? 'play' : 'plays'}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-gold" />
          <span className="text-sm">
            <span className="font-bold text-ink">{winCount}</span>{' '}
            <span className="text-muted">{winCount === 1 ? 'win' : 'wins'}</span>
            {playCount > 0 && (
              <span className="text-muted ml-1">({winRate}%)</span>
            )}
          </span>
        </div>

        {gameStats?.lastPlayed && (
          <div className="text-sm text-muted">
            Last played:{' '}
            <span className="text-ink">
              {new Date(gameStats.lastPlayed).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {userGame.tags && userGame.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {userGame.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-paper-2 text-muted border border-gold-2/30"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Notes (collapsible) */}
      {userGame.notes && (
        <div className="pt-2">
          <button
            className="flex items-center gap-1 text-sm text-muted hover:text-gold transition-colors"
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Notes
          </button>
          {showNotes && (
            <p className="mt-2 text-sm text-ink bg-paper-2/50 rounded p-3 whitespace-pre-wrap">
              {userGame.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
