/**
 * UnplacedGamesPanel Component (Phase 2 - Enhanced)
 *
 * Shows games that are in the library but not placed on the shelf.
 * - Horizontal scrollable list on desktop
 * - Supports drag-and-drop to place games on shelf
 * - Collapsed by default when empty
 * - Editing works on mobile (only drag is disabled)
 *
 * Uses @dnd-kit hooks for drag-and-drop (useDroppable, useDraggable).
 */

import { useState, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { LibraryId, LibraryGameView } from '../../types/library';
import { useShelfDrag } from './ShelfView';

interface UnplacedGamesPanelProps {
  libraryId: LibraryId;
  games: LibraryGameView[];
  isReadOnly?: boolean;
  isMobile?: boolean;
  onEditItem?: (item: LibraryGameView) => void;
  onDeleteItem?: (item: LibraryGameView) => void;
  onToggleFavorite?: (item: LibraryGameView) => void;
}

/**
 * Individual draggable game item in the unplaced panel.
 */
interface DraggableUnplacedGameProps {
  game: LibraryGameView;
  index: number;
  isDragDisabled: boolean;
  isBeingDragged: boolean;
  onEditItem?: (item: LibraryGameView) => void;
}

function DraggableUnplacedGame({
  game,
  index,
  isDragDisabled,
  isBeingDragged,
  onEditItem,
}: DraggableUnplacedGameProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: game.gameId,
    disabled: isDragDisabled,
    data: {
      sourceType: 'unplaced',
      index,
      gameId: game.gameId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    // Hide the original when dragging (DragOverlay shows the preview)
    opacity: isDragging || isBeingDragged ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex-shrink-0 w-24 group relative rounded-lg overflow-hidden transition-transform cursor-pointer bg-white border border-gold-2',
        !isDragDisabled && 'hover:scale-[1.02] hover:border-gold'
      )}
      style={style}
      onClick={(e) => {
        if (!onEditItem) return;
        e.stopPropagation();
        onEditItem(game);
      }}
      title={game.gameName}
    >
      {/* Game thumbnail or placeholder */}
      <div className="aspect-square">
        {game.gameThumbnail ? (
          <img
            src={game.gameThumbnail}
            alt={game.gameName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
            <span className="text-amber-800 text-xs font-bold text-center px-1">
              {game.gameName.slice(0, 10)}
            </span>
          </div>
        )}
      </div>

      {/* Game name */}
      <div className="p-1.5 bg-white">
        <p className="text-xs font-medium text-ink line-clamp-2 leading-tight">
          {game.gameName}
        </p>
      </div>

      {/* Drag hint - only show when drag is enabled */}
      {!isDragDisabled && !isDragging && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="bg-black/70 text-white text-[10px] px-2 py-1 rounded">
            Drag to shelf
          </span>
        </div>
      )}
    </div>
  );
}

export function UnplacedGamesPanel({
  libraryId,
  games,
  isReadOnly = false,
  isMobile = false,
  onEditItem,
  onDeleteItem: _onDeleteItem,
  onToggleFavorite: _onToggleFavorite,
}: UnplacedGamesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isEmpty = games.length === 0;

  // Drag is disabled on mobile and when read-only
  const isDragDisabled = isReadOnly || isMobile;

  // Get drag context to know which game is being dragged
  const { activeGameId } = useShelfDrag();

  // Setup droppable for the unplaced panel
  const { setNodeRef, isOver } = useDroppable({
    id: 'unplaced',
    disabled: isDragDisabled,
    data: {
      droppableType: 'unplaced',
      libraryId,
    },
  });

  // Auto-expand when games are added (using useEffect to avoid render-time state update)
  useEffect(() => {
    if (games.length > 0 && !isExpanded) {
      setIsExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.length]); // isExpanded omitted: we only expand, never collapse

  return (
    <div className="border border-gold-2 rounded-lg overflow-hidden bg-paper">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gold/5 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="unplaced-games-content"
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted" />
          <span className="font-medium text-ink">
            Unplaced Games
          </span>
          {games.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
              {games.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div
          id="unplaced-games-content"
          className="border-t border-gold-2 p-4"
        >
          <div
            ref={setNodeRef}
            className={cn(
              'min-h-[100px] rounded-lg transition-colors overflow-x-auto flex gap-3 pb-2 relative',
              isOver && !isDragDisabled && 'bg-gold/10 ring-2 ring-gold ring-inset'
            )}
          >
            {games.map((game, index) => (
              <DraggableUnplacedGame
                key={game.gameId}
                game={game}
                index={index}
                isDragDisabled={isDragDisabled}
                isBeingDragged={activeGameId === game.gameId}
                onEditItem={onEditItem}
              />
            ))}

            {/* Empty state overlay */}
            {isEmpty && (
              <div className="absolute inset-0 flex flex-col items-center justify-center py-8 text-center pointer-events-none">
                <Package className="w-8 h-8 text-muted mb-2" />
                <p className="text-sm text-muted">
                  {isReadOnly
                    ? 'All games have been placed on the shelf'
                    : 'All games are on the shelf! Add more games to see them here.'}
                </p>
              </div>
            )}
          </div>

          {/* Help text */}
          {!isEmpty && !isDragDisabled && (
            <p className="text-xs text-muted mt-3 text-center">
              Drag games to place them on your shelf, or drop shelf games here to unplace them.
            </p>
          )}

          {/* Mobile help text */}
          {!isEmpty && isMobile && !isReadOnly && (
            <p className="text-xs text-muted mt-3 text-center">
              Tap a game to edit it. Switch to desktop to drag games onto the shelf.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
