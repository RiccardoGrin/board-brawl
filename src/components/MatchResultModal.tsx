import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import type { BracketMatch, Player, PlayerId } from '../types/tournament';
import { getRoundName } from '../utils/bracketGenerator';
import { cn } from '../utils/cn';

/**
 * MatchResultModal Component
 * 
 * Modal for recording or editing bracket match results.
 * 
 * Features:
 * - Record winner for new matches
 * - Edit winner for completed matches
 * - Clear/reset match results (edit mode only)
 * - Warning shown when editing (may affect subsequent matches)
 * 
 * @param match - The bracket match being recorded/edited
 * @param players - All tournament players (for display)
 * @param totalRounds - Total rounds in bracket (for round name display)
 * @param isEditMode - Whether editing an existing result (vs recording new)
 * @param onConfirm - Callback with selected winner ID (or null to clear)
 * @param onCancel - Callback to close modal without changes
 */
interface MatchResultModalProps {
  match: BracketMatch;
  players: Player[];
  totalRounds: number;
  isEditMode: boolean;
  onConfirm: (winnerId: PlayerId | null) => void;
  onCancel: () => void;
}

export function MatchResultModal({
  match,
  players,
  totalRounds,
  isEditMode,
  onConfirm,
  onCancel,
}: MatchResultModalProps) {
  const [selectedWinnerId, setSelectedWinnerId] = useState<PlayerId | null>(
    match.winnerId || null
  );

  const player1 = players.find(p => p.id === match.player1Id);
  const player2 = players.find(p => p.id === match.player2Id);
  const originalWinnerId = match.winnerId ?? null;

  if (!player1 || !player2) {
    return null;
  }

  const handleConfirm = () => {
    if (selectedWinnerId !== null) {
      onConfirm(selectedWinnerId);
    }
  };

  const handleReset = () => {
    setSelectedWinnerId(null);
    onConfirm(null);
  };

  const roundName = getRoundName(match.round, totalRounds);
  const hasWinnerChanged = isEditMode && selectedWinnerId !== originalWinnerId;

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={isEditMode ? 'Edit Match Result' : 'Record Match Result'}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {isEditMode && (
            <Button
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              onClick={handleReset}
            >
              Reset Match
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={selectedWinnerId === null}
          >
            {isEditMode ? 'Update Winner' : 'Confirm Winner'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Match info */}
        <div className="text-center pb-4 border-b border-border">
          <p className="text-sm text-muted engraved">{roundName}</p>
          <p className="text-xs text-muted mt-1">Match {match.matchNumber + 1}</p>
        </div>

        {/* Player selection */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-muted engraved">
            Select Winner
          </label>

          {/* Player 1 */}
          <label
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              selectedWinnerId === player1.id
                ? 'border-gold bg-gold/10'
                : 'border-border hover:border-gold-2'
            )}
          >
            <input
              type="radio"
              name="winner"
              value={player1.id}
              checked={selectedWinnerId === player1.id}
              onChange={() => setSelectedWinnerId(player1.id)}
              className="w-4 h-4 text-gold focus:ring-gold"
            />
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: player1.color }}
            >
              {player1.name.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 font-medium text-ink">{player1.name}</span>
          </label>

          {/* Player 2 */}
          <label
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              selectedWinnerId === player2.id
                ? 'border-gold bg-gold/10'
                : 'border-border hover:border-gold-2'
            )}
          >
            <input
              type="radio"
              name="winner"
              value={player2.id}
              checked={selectedWinnerId === player2.id}
              onChange={() => setSelectedWinnerId(player2.id)}
              className="w-4 h-4 text-gold focus:ring-gold"
            />
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: player2.color }}
            >
              {player2.name.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 font-medium text-ink">{player2.name}</span>
          </label>
        </div>

        {hasWinnerChanged && (
          <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">Warning</p>
              <p>
                Changing this result may affect subsequent matches. This action cannot be automatically reversed.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}


