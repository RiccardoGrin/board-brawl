import { useState } from 'react';
import { Check, Edit2 } from 'lucide-react';
import type { Tournament, BracketMatch, Player } from '../types/tournament';
import { getRoundName } from '../utils/bracketGenerator';
import { cn } from '../utils/cn';

/**
 * BracketView Component
 * 
 * Displays a single-elimination tournament bracket with responsive layouts:
 * - Desktop (≥768px): All rounds in columns with visual connections
 * - Mobile (<768px): Dropdown to select which round to view
 * 
 * Match States:
 * - Ready: Both players present, not complete (gold border, clickable)
 * - Pending: Waiting for previous round winners (dashed border, TBD)
 * - Complete: Winner recorded (green tint, checkmark, editable)
 */
interface BracketViewProps {
  tournament: Tournament;
  bracket: BracketMatch[];
  players: Player[];
  canEdit: boolean;
  onMatchClick: (match: BracketMatch) => void;
}

export function BracketView({
  tournament,
  bracket,
  players,
  canEdit,
  onMatchClick,
}: BracketViewProps) {
  const totalRounds = tournament.bracketConfig?.totalRounds || 1;
  const currentRound = tournament.bracketConfig?.currentRound || 1;
  const [activeRound, setActiveRound] = useState(currentRound);

  // Get player by ID
  const getPlayer = (playerId: string | null) => {
    if (!playerId) return null;
    return players.find(p => p.id === playerId);
  };

  // Group matches by round
  const matchesByRound: Record<number, BracketMatch[]> = {};
  for (let round = 1; round <= totalRounds; round++) {
    matchesByRound[round] = bracket
      .filter(m => m.round === round)
      .sort((a, b) => a.matchNumber - b.matchNumber);
  }

  // Render a single match card
  const renderMatch = (match: BracketMatch) => {
    const player1 = getPlayer(match.player1Id);
    const player2 = getPlayer(match.player2Id);

    // Determine match state
    const isPending = !match.isComplete && (!player1 || !player2);
    const isReady = !match.isComplete && player1 && player2;
    const isComplete = match.isComplete;

    // Allow clicking if editable and match has both players
    const isClickable = canEdit && (isReady || (isComplete && player1 && player2));

    return (
      <div
        key={match.id}
        className={cn(
          "card-medieval p-4 transition-all relative",
          isClickable && "cursor-pointer hover:translate-y-[-2px] hover:shadow-main",
          isReady && "border-gold ring-1 ring-gold/20",
          isPending && "border-dashed opacity-60",
          isComplete && "border-green/30 bg-green/5"
        )}
        onClick={() => isClickable && onMatchClick(match)}
      >
        {/* Edit icon for completed matches */}
        {isComplete && canEdit && (
          <div className="absolute top-2 right-2 text-muted hover:text-gold transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </div>
        )}

        <div className="space-y-2">
          {/* Player 1 */}
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded transition-colors",
              match.winnerId === player1?.id && "bg-green/10"
            )}
          >
            {player1 ? (
              <>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: player1.color }}
                >
                  {player1.name.charAt(0).toUpperCase()}
                </div>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    match.winnerId === player1.id && "font-bold text-ink"
                  )}
                >
                  {player1.name}
                </span>
                {match.winnerId === player1.id && (
                  <Check className="w-4 h-4 text-green" />
                )}
              </>
            ) : (
              <span className="text-sm text-muted italic">TBD</span>
            )}
          </div>

          {/* VS Divider */}
          <div className="h-px bg-border opacity-40" />

          {/* Player 2 */}
          {player2 || isPending ? (
            <div
              className={cn(
                "flex items-center gap-2 p-2 rounded transition-colors",
                match.winnerId === player2?.id && "bg-green/10"
              )}
            >
              {player2 ? (
                <>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: player2.color }}
                  >
                    {player2.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      match.winnerId === player2.id && "font-bold text-ink"
                    )}
                  >
                    {player2.name}
                  </span>
                  {match.winnerId === player2.id && (
                    <Check className="w-4 h-4 text-green" />
                  )}
                </>
              ) : (
                <span className="text-sm text-muted italic">TBD</span>
              )}
            </div>
          ) : null}

          {/* Ready state button */}
          {isReady && canEdit && (
            <div className="pt-2">
              <div className="text-xs text-center text-gold font-semibold engraved">
                Click to Record Result
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Mobile: Dropdown view (one round at a time)
  const renderMobileView = () => {
    return (
      <div className="md:hidden">
        {/* Dropdown navigation */}
        <div className="mb-6">
          <label htmlFor="round-select" className="block text-sm font-medium text-muted engraved mb-2">
            Select Round
          </label>
          <select
            id="round-select"
            value={activeRound}
            onChange={(e) => setActiveRound(Number(e.target.value))}
            className="w-full h-12 px-4 text-base bg-paper/70 border-2 border-gold-2/30 rounded-lg focus:border-gold focus:outline-none engraved"
          >
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
              const isComplete = matchesByRound[round]?.every(m => m.isComplete) || false;
              const isCurrent = round === currentRound;
              const roundName = getRoundName(round, totalRounds);
              
              return (
                <option key={round} value={round}>
                  {roundName}
                  {isCurrent && !isComplete ? ' (Current)' : ''}
                  {isComplete ? ' ✓' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Active round matches */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-ink engraved">
            {getRoundName(activeRound, totalRounds)}
          </h3>
          <div className="space-y-3">
            {matchesByRound[activeRound]?.map(renderMatch)}
          </div>
        </div>
      </div>
    );
  };

  // Desktop: Column layout with all rounds visible
  const renderDesktopView = () => {
    return (
      <div className="hidden md:block overflow-x-auto">
        <div className="flex gap-8 min-w-max pb-4">
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
            const isComplete = matchesByRound[round]?.every(m => m.isComplete) || false;
            const isCurrent = round === currentRound;

            return (
              <div key={round} className="flex-shrink-0" style={{ width: '280px' }}>
                {/* Round header */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-ink engraved flex items-center gap-2">
                    {getRoundName(round, totalRounds)}
                    {isCurrent && !isComplete && (
                      <span className="inline-block w-2.5 h-2.5 bg-gold rounded-full" />
                    )}
                  </h3>
                  {isComplete && (
                    <p className="text-xs text-muted mt-1">Complete</p>
                  )}
                </div>

                {/* Matches */}
                <div className="space-y-6">
                  {matchesByRound[round]?.map(renderMatch)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Game title header */}
      <div className="mb-6 pb-4 border-b border-border flex items-center gap-4">
        {tournament.bracketConfig?.gameMeta?.thumbnail ? (
          <img
            src={tournament.bracketConfig.gameMeta.thumbnail}
            alt=""
            className="w-16 h-16 rounded object-cover border border-border-2 shadow-sm shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-xl font-bold text-gold shrink-0">
            {(tournament.bracketConfig?.gameTitle || 'B').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold text-ink engraved">
            {tournament.bracketConfig?.gameTitle || 'Bracket Tournament'}
          </h2>
          <p className="text-sm text-muted mt-1">
            {totalRounds} Round{totalRounds !== 1 ? 's' : ''} • Single Elimination
          </p>
        </div>
      </div>

      {/* Mobile and Desktop views */}
      {renderMobileView()}
      {renderDesktopView()}
    </div>
  );
}

