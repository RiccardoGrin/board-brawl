import { Link } from 'react-router-dom';
import { Trophy, Users, Calendar, ExternalLink } from 'lucide-react';
import type { GameSession } from '../../types/tournament';
import { cn } from '../../utils/cn';

interface GameSessionCardProps {
  session: GameSession;
  /** Show the game name prominently (for Plays page) */
  showGameName?: boolean;
  /** Optional click handler */
  onClick?: () => void;
  /** Tournament name to display instead of generic "Tournament" link text */
  tournamentName?: string;
}

export function GameSessionCard({ session, showGameName = true, onClick, tournamentName }: GameSessionCardProps) {
  const playedDate = session.playedAt || session.createdAt;
  const formattedDate = new Date(playedDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Get winner names from placements
  const getWinnerNames = (): string[] => {
    if (!session.results?.placements) return [];

    const firstPlace = session.results.placements.find((p) => p.rank === 1);
    if (!firstPlace) return [];

    return firstPlace.playerIds
      .map((playerId) => {
        const participant = session.participants.find((p) => p.playerId === playerId);
        return participant?.name || 'Unknown';
      })
      .filter(Boolean);
  };

  // Get all participant names
  const getParticipantNames = (): string => {
    const names = session.participants.map((p) => p.name);
    if (names.length <= 3) {
      return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  };

  const winners = getWinnerNames();
  const isTeamGame = session.results?.mode === 'teams';

  const CardWrapper = onClick ? 'button' : 'div';
  const cardProps = onClick ? {
    onClick,
    type: 'button' as const,
    className: cn(
      "card-medieval p-4 hover:shadow-md transition-shadow w-full text-left",
      "hover:border-gold-2 cursor-pointer"
    ),
  } : {
    className: "card-medieval p-4 hover:shadow-md transition-shadow",
  };

  return (
    <CardWrapper {...cardProps}>
      <div className="flex items-start gap-4">
        {/* Game Thumbnail */}
        {(session.gameThumbnail || session.gameMeta?.thumbnail) ? (
          <img
            src={session.gameThumbnail || session.gameMeta?.thumbnail}
            alt=""
            className="w-14 h-14 rounded object-cover border border-border-2 shadow-sm shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-lg font-bold text-gold shrink-0">
            {session.gameName?.slice(0, 1).toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Game Name (shown on Plays page) */}
          {showGameName && session.gameName && (
            <h3 className="text-lg font-bold text-ink engraved truncate">
              {session.gameName}
            </h3>
          )}

          {/* Date and Tournament Link */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted">
              <Calendar className="w-4 h-4" />
              {formattedDate}
            </div>

            {session.tournamentId && (
              <Link
                to={`/tournament/${session.tournamentId}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-gold hover:text-gold/80 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-xs font-medium truncate max-w-[20ch]">
                  {tournamentName || 'Tournament'}
                </span>
              </Link>
            )}
          </div>

          {/* Winner */}
          {winners.length > 0 && (
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-ink">
                {winners.join(' & ')} won
              </span>
              {isTeamGame && (
                <span className="text-xs text-muted">(Team game)</span>
              )}
            </div>
          )}

          {/* Participants */}
          <div className="flex items-center gap-2 text-sm text-muted">
            <Users className="w-4 h-4" />
            <span>{getParticipantNames()}</span>
          </div>

          {/* Note preview */}
          {session.note && (
            <p className="text-sm text-muted line-clamp-1 italic">
              "{session.note}"
            </p>
          )}
        </div>

        {/* Session Points/Rank indicator could go here in future */}
      </div>
    </CardWrapper>
  );
}
