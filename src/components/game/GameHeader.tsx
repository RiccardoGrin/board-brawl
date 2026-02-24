import { Users, Clock, Star, Package } from 'lucide-react';
import type { GameRecord } from '../../services/gameSearch';

interface GameHeaderProps {
  game: GameRecord;
  userRating?: number;
  showUserRating?: boolean;
}

export function GameHeader({ game, userRating, showUserRating = true }: GameHeaderProps) {
  const formatPlaytime = () => {
    if (game.minPlaytime && game.maxPlaytime && game.minPlaytime !== game.maxPlaytime) {
      return `${game.minPlaytime}-${game.maxPlaytime}`;
    }
    return game.playingTime?.toString() || game.minPlaytime?.toString() || '—';
  };

  const formatPlayers = () => {
    if (game.minPlayers && game.maxPlayers) {
      if (game.minPlayers === game.maxPlayers) {
        return game.minPlayers.toString();
      }
      return `${game.minPlayers}-${game.maxPlayers}`;
    }
    return game.minPlayers?.toString() || '—';
  };

  return (
    <div className="space-y-6">
      {/* Game Image */}
      <div className="flex justify-center">
        {game.image || game.thumbnail ? (
          <img
            src={game.image || game.thumbnail}
            alt={game.primaryName}
            className="w-full max-w-sm rounded-lg border border-gold-2 shadow-soft object-contain max-h-80"
          />
        ) : (
          <div className="w-full max-w-sm aspect-square bg-paper-2 rounded-lg border border-dashed border-gold-2 flex items-center justify-center">
            <Package className="w-16 h-16 text-gold-2" />
          </div>
        )}
      </div>

      {/* Quick Info Cards */}
      <div className={`grid gap-3 ${showUserRating ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <div className="card-medieval p-4 text-center">
          <Users className="w-5 h-5 text-gold mx-auto mb-1.5" />
          <div className="text-lg font-bold text-ink">{formatPlayers()}</div>
          <div className="text-xs text-muted">Players</div>
        </div>

        <div className="card-medieval p-4 text-center">
          <Clock className="w-5 h-5 text-gold mx-auto mb-1.5" />
          <div className="text-lg font-bold text-ink">{formatPlaytime()}</div>
          <div className="text-xs text-muted">Minutes</div>
        </div>

        <div className="card-medieval p-4 text-center">
          <Star className="w-5 h-5 text-gold mx-auto mb-1.5" />
          <div className="text-lg font-bold text-ink">
            {game.rating ? game.rating.toFixed(1) : '—'}
          </div>
          <div className="text-xs text-muted">BGG Rating</div>
        </div>

        {showUserRating && (
          userRating !== undefined ? (
            <div className="card-medieval p-4 text-center border-gold">
              <Star className="w-5 h-5 text-gold fill-gold mx-auto mb-1.5" />
              <div className="text-lg font-bold text-ink">{userRating}</div>
              <div className="text-xs text-muted">My Rating</div>
            </div>
          ) : (
            <div className="card-medieval p-4 text-center">
              <Star className="w-5 h-5 text-gold-2 mx-auto mb-1.5" />
              <div className="text-lg font-bold text-muted">—</div>
              <div className="text-xs text-muted">My Rating</div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
