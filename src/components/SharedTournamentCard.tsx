import { CheckCircle, Calendar, Users, Gamepad2 } from 'lucide-react';
import type { Tournament } from '../types/tournament';
import { useOwnerProfile } from '../hooks/useOwnerProfile';

interface SharedTournamentCardProps {
  tournament: Tournament;
  onOpen: (id: string) => void;
}

/**
 * Card component for displaying a shared tournament with dynamic owner name.
 * Uses useOwnerProfile to fetch the owner's current display name.
 */
export function SharedTournamentCard({ tournament, onOpen }: SharedTournamentCardProps) {
  // Fetch owner's current display name dynamically
  const ownerDisplayName = useOwnerProfile(tournament.ownerId, tournament.ownerName);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const gamesPlayed = tournament.format === 'bracket' && tournament.bracketConfig
    ? tournament.bracketConfig.bracket.filter(match => match.isComplete).length
    : tournament.gameSessions.length;

  return (
    <div 
      onClick={() => onOpen(tournament.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(tournament.id)}
      role="listitem"
      tabIndex={0}
      className="card-medieval card-medieval-interactive p-6 cursor-pointer group w-full relative"
      aria-label={`Open shared tournament: ${tournament.name}`}
    >
      <div className="flex justify-between items-start relative w-full">
        <div className="space-y-1 flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-2xl font-bold text-ink engraved group-hover:text-gold transition-colors truncate">
              {tournament.name}
            </h3>
            {tournament.state === 'finished' && (
              <CheckCircle className="w-5 h-5 text-gold shrink-0" aria-hidden="true" />
            )}
            {tournament.state === 'finished' && (
              <span className="sr-only">Finished tournament</span>
            )}
          </div>
          {tournament.description && (
            <p className="text-sm text-muted engraved italic truncate w-full mb-3">
              {tournament.description}
            </p>
          )}
          <div className="flex items-center text-sm text-muted engraved gap-4 font-medium overflow-hidden">
            <div className="flex items-center gap-4 overflow-hidden">
              <span className="flex items-center shrink-0">
                <Calendar className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                <span className="sr-only">Date:</span> {formatDate(tournament.date)}
              </span>
              <span className="flex items-center shrink-0">
                <Users className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                {tournament.players.length}<span className="hidden sm:inline ml-1">Players</span>
                <span className="sr-only">Players</span>
              </span>
              <span className="flex items-center shrink-0">
                <Gamepad2 className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                {gamesPlayed}<span className="hidden sm:inline ml-1">Games</span>
                <span className="sr-only">Games</span>
              </span>
            </div>
          </div>
          {/* Show owner name for shared tournaments */}
          <p className="text-xs text-muted/80 mt-2">
            Hosted by {ownerDisplayName}
          </p>
        </div>
      </div>
    </div>
  );
}

