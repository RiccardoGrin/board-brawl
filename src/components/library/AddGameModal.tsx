import { useState, useMemo } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { GameInput, type GameInputValue } from '../ui/game-input';
import { Input, Textarea } from '../ui/input';
import type { UserGameStatus } from '../../types/library';
import { useLibraryStore } from '../../store/libraryStore';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (game: {
    gameId: string;
    gameName: string;
    gameThumbnail?: string;
    gameYear?: number;
    status: UserGameStatus;
    myRating?: number;
    notes?: string;
    boxWidthMm?: number;
    boxHeightMm?: number;
    boxDepthMm?: number;
    focalPointX?: number;
    focalPointY?: number;
  }) => void;
  existingGameIds?: Set<string>;
}

export function AddGameModal({ isOpen, onClose, onAdd, existingGameIds }: AddGameModalProps) {
  const [searchValue, setSearchValue] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameInputValue | null>(null);
  const [status, setStatus] = useState<UserGameStatus>('owned');
  const [rating, setRating] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Get library names for "Already in X libraries" badge
  const libraries = useLibraryStore((state) => state.libraries);
  const getGameLibraryIds = useLibraryStore((state) => state.getGameLibraryIds);

  // Get owned game IDs for the dropdown badge
  const userGames = useLibraryStore((state) => state.userGames);
  const ownedGameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [gameId, game] of Object.entries(userGames)) {
      if (game.status === 'owned') {
        ids.add(gameId);
      }
    }
    return ids;
  }, [userGames]);

  const handleGameSelect = (game: GameInputValue) => {
    setSelectedGame(game);
    setSearchValue(game.name);
    setError(null);
  };

  // Check if game is in other libraries (for badge display)
  const getOtherLibraryNames = (gameId: string | undefined): string[] => {
    if (!gameId) return [];
    const libraryIds = getGameLibraryIds(gameId);
    return libraryIds
      .filter((id) => !existingGameIds?.has(id)) // Exclude current library
      .map((id) => libraries[id]?.name)
      .filter((name): name is string => !!name);
  };

  const otherLibraryNames = selectedGame?.gameId
    ? getOtherLibraryNames(selectedGame.gameId)
    : [];

  const handleSubmit = () => {
    if (!selectedGame) {
      setError('Please select a game from the search results.');
      return;
    }

    if (selectedGame.gameId && existingGameIds?.has(selectedGame.gameId)) {
      setError('This game is already in this library.');
      return;
    }

    // Generate a gameId if we don't have one (manual entry)
    const gameId = selectedGame.gameId || crypto.randomUUID();

    // Parse rating
    const parsedRating = rating ? parseFloat(rating) : undefined;
    if (parsedRating !== undefined && (isNaN(parsedRating) || parsedRating < 0 || parsedRating > 10)) {
      setError('Rating must be between 0 and 10.');
      return;
    }

    onAdd({
      gameId,
      gameName: selectedGame.name,
      gameThumbnail: selectedGame.meta?.thumbnail,
      gameYear: selectedGame.meta?.year,
      status,
      myRating: parsedRating,
      notes: notes.trim() || undefined,
      boxWidthMm: selectedGame.meta?.boxWidthMm,
      boxHeightMm: selectedGame.meta?.boxHeightMm,
      boxDepthMm: selectedGame.meta?.boxDepthMm,
      focalPointX: selectedGame.meta?.focalPointX,
      focalPointY: selectedGame.meta?.focalPointY,
    });

    // Reset form
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setSearchValue('');
    setSelectedGame(null);
    setStatus('owned');
    setRating('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Game to Library">
      <div className="space-y-4">
        {/* Game Search */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Search for a game <span className="text-red-500">*</span>
          </label>
          <GameInput
            value={searchValue}
            onChange={(val) => {
              setSearchValue(val);
              if (selectedGame && val !== selectedGame.name) {
                setSelectedGame(null);
              }
              setError(null);
            }}
            onSelect={handleGameSelect}
            selectedGame={selectedGame}
            placeholder="Start typing to search..."
            aria-label="Search for board game"
            aria-invalid={!!error}
            ownedGameIds={ownedGameIds}
          />

          {/* Already in X libraries badge */}
          {otherLibraryNames.length > 0 && (
            <div className="text-xs text-muted bg-paper-2 px-3 py-2 rounded">
              Already in {otherLibraryNames.length}{' '}
              {otherLibraryNames.length === 1 ? 'library' : 'libraries'}:{' '}
              <span className="font-medium">{otherLibraryNames.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Rating (optional) */}
        <div className="space-y-2">
          <label htmlFor="game-rating" className="block text-sm font-medium text-ink">
            Your Rating <span className="text-muted text-xs">(0-10, optional)</span>
          </label>
          <Input
            id="game-rating"
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="e.g., 8.5"
            className="w-24"
          />
        </div>

        {/* Notes (optional) */}
        <div className="space-y-2">
          <label htmlFor="game-notes" className="block text-sm font-medium text-ink">
            Notes <span className="text-muted text-xs">(optional)</span>
          </label>
          <Textarea
            id="game-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any personal notes about this game..."
            maxLength={500}
            rows={2}
            className="resize-none min-h-[60px]"
          />
          <div className="text-xs text-muted text-right">{notes.length}/500</div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="divider-line" />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!selectedGame || !!error}>
            <Plus className="w-4 h-4 mr-1" />
            Add to Library
          </Button>
        </div>
      </div>
    </Modal>
  );
}
