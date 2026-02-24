/**
 * ShelfCell Component (Phase 2 - Enhanced)
 *
 * Represents a single cell in the virtual shelf grid.
 * - Percentage-based game sizing: games scale proportionally with the cell
 *   at any viewport size (e.g., 6cm depth in 30cm cell = 20% of cell height)
 * - Orientation toggle (vertical/horizontal stacking)
 * - Clear drop target feedback for empty and populated cells
 * - Sharp corners for realistic shelf appearance
 * - Games fill the cell completely (no padding waste)
 * - Capacity based on actual game dimensions, not fixed count
 *
 * Uses @dnd-kit/sortable for within-cell reordering with visual feedback.
 */

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Package, ArrowRightLeft, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { LibraryId, LibraryGameView, CellIndex, ShelfCell as ShelfCellType } from '../../types/library';
import { SHELF_SCALE, getGameDimensions, canFitGameInCell } from '../../types/library';
import { useShelfDrag } from './ShelfView';

interface ShelfCellProps {
  libraryId: LibraryId;
  cellIndex: CellIndex;
  cell: ShelfCellType;
  games: LibraryGameView[];
  backingColor: string;
  isReadOnly?: boolean;
  isMobile?: boolean;
  hideEmptyPlaceholder?: boolean;
  onEditItem?: (item: LibraryGameView) => void;
  onDeleteItem?: (item: LibraryGameView) => void;
  onToggleFavorite?: (item: LibraryGameView) => void;
  onToggleOrientation?: (cellIndex: CellIndex) => void;
}

/**
 * Individual sortable game item within a cell.
 * Uses useSortable for both dragging and drop target functionality.
 */
interface SortableGameProps {
  game: LibraryGameView;
  index: number;
  cellIndex: CellIndex;
  isVertical: boolean;
  stackingPercent: number; // Depth % for vertical, width % for horizontal (stacking dimension)
  sizePercent: number; // Width % for vertical, height % for horizontal (perpendicular dimension)
  isDragDisabled: boolean;
  isBeingDragged: boolean;
  onEditItem?: (item: LibraryGameView) => void;
}

/**
 * Placeholder game item for cross-cell drag feedback.
 * Renders a semi-transparent dashed border indicator showing where the game will land.
 */
interface PlaceholderGameProps {
  gameId: string;
  cellIndex: CellIndex;
  isVertical: boolean;
  stackingPercent: number; // Depth % for vertical, width % for horizontal
  sizePercent: number; // Width % for vertical, height % for horizontal
}

function PlaceholderGame({
  gameId,
  cellIndex,
  isVertical,
  stackingPercent,
  sizePercent,
}: PlaceholderGameProps) {
  const {
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: gameId,
    data: {
      sourceType: 'cell',
      cellIndex,
    },
  });

  const style = {
    // Vertical: height=stacking, width=size; Horizontal: width=stacking, height=size
    [isVertical ? 'height' : 'width']: `${stackingPercent}%`,
    [isVertical ? 'width' : 'height']: `${sizePercent}%`,
    flexShrink: 0,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-[1px] bg-gold-300/40 border-2 border-dashed border-gold-400",
        isVertical ? "self-center" : "self-end"
      )}
      style={style}
    />
  );
}


function SortableGame({
  game,
  index,
  cellIndex,
  isVertical,
  stackingPercent,
  sizePercent,
  isDragDisabled,
  isBeingDragged,
  onEditItem,
}: SortableGameProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: game.gameId,
    disabled: isDragDisabled,
    data: {
      sourceType: 'cell',
      cellIndex,
      index,
      gameId: game.gameId,
    },
  });

  // Focal point for object-position (defaults to center)
  // Same focal point used for both orientations - the rotation handles the visual change
  const focalX = game.focalPointX ?? 50;
  const focalY = game.focalPointY ?? 50;
  const objectPosition = `${focalX}% ${focalY}%`;

  const style = {
    // Vertical: height=stacking (depth), width=size (width)
    // Horizontal: width=stacking (width), height=size (height)
    [isVertical ? 'height' : 'width']: `${stackingPercent}%`,
    [isVertical ? 'width' : 'height']: `${sizePercent}%`,
    flexShrink: 0,
    // Apply transform during drag/sort animations
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide the original when dragging (DragOverlay shows the preview)
    opacity: isDragging || isBeingDragged ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'relative overflow-hidden cursor-pointer transition-opacity',
        'rounded-[1px]',
        isVertical ? 'self-center' : 'self-end',
        !isDragDisabled && 'hover:brightness-110'
      )}
      style={{
        ...style,
        // 3D depth effect with edge highlights (top-left light source)
        // Vertical: inset shadows only (drop shadows would fall on game below)
        // Horizontal: drop shadows to the side work well
        boxShadow: isVertical
          ? `
            inset 2px 2px 4px rgba(0,0,0,0.25),
            inset -1px -1px 2px rgba(0,0,0,0.1),
            inset 1px 1px 0 rgba(255,255,255,0.15)
          `
          : `
            2px 3px 6px rgba(0,0,0,0.3),
            1px 1px 2px rgba(0,0,0,0.2),
            inset 1px 1px 0 rgba(255,255,255,0.2),
            inset -1px -1px 0 rgba(0,0,0,0.15)
          `,
      }}
      onClick={(e) => {
        if (!onEditItem) return;
        e.stopPropagation();
        onEditItem(game);
      }}
      title={game.gameName}
    >
      {/* Game thumbnail or placeholder - rotated for horizontal orientation */}
      {game.gameThumbnail ? (
        isVertical ? (
          <img
            src={game.gameThumbnail}
            alt={game.gameName}
            className="w-full h-full object-cover"
            style={{ objectPosition }}
            loading="lazy"
          />
        ) : (
          /* For horizontal: create a wrapper with the same dimensions as vertical (sizePercent x stackingPercent of cell),
             apply object-cover and objectPosition for consistent cropping, then rotate -90deg.
             After rotation, this fills the horizontal container (stackingPercent x sizePercent) exactly. */
          <div className="w-full h-full relative overflow-hidden">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
              style={{
                // Inner dimensions match vertical: width=sizePercent, height=stackingPercent of CELL
                // Convert to parent-relative: parent is (stackingPercent x sizePercent) of cell
                width: `${(sizePercent / stackingPercent) * 100}%`,
                height: `${(stackingPercent / sizePercent) * 100}%`,
              }}
            >
              <img
                src={game.gameThumbnail}
                alt={game.gameName}
                className="w-full h-full object-cover"
                style={{ objectPosition }}
                loading="lazy"
              />
            </div>
          </div>
        )
      ) : (
        <div className={cn(
          'w-full h-full bg-gradient-to-br from-amber-200 to-amber-300 flex items-center justify-center',
          !isVertical && '-rotate-90'
        )}>
          <span className="text-amber-800 text-[10px] font-bold text-center px-0.5 line-clamp-2 leading-tight">
            {game.gameName.slice(0, 15)}
          </span>
        </div>
      )}

      {/* Game name overlay on hover */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1',
          'opacity-0 group-hover:opacity-100 transition-opacity'
        )}
      >
        <p className="text-white text-[9px] font-medium line-clamp-1 leading-tight">
          {game.gameName}
        </p>
      </div>
    </div>
  );
}

export function ShelfCell({
  libraryId,
  cellIndex,
  cell,
  games,
  backingColor,
  isReadOnly = false,
  isMobile = false,
  hideEmptyPlaceholder = false,
  onEditItem,
  onDeleteItem: _onDeleteItem,
  onToggleFavorite: _onToggleFavorite,
  onToggleOrientation,
}: ShelfCellProps) {
  const { activeGameId, activeGame, dragOverCell } = useShelfDrag();

  const droppableId = `cell-${cellIndex}`;
  const isEmpty = games.length === 0;
  const orientation = cell.orientation || 'vertical';
  const isVertical = orientation === 'vertical';

  // Get cell size constant for percentage calculations
  const { cellSizeCm } = SHELF_SCALE;

  // Check if cell is full for the currently dragged game (or any game if not dragging)
  // This makes the "full" indicator reflect whether the currently-dragged game can fit
  const isFull = !canFitGameInCell(games, activeGame ?? undefined, orientation);

  // Determine if drag operations are disabled (mobile or read-only)
  const isDragDisabled = isReadOnly || isMobile;

  // Setup droppable for the cell (handles drops from other cells/unplaced)
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    disabled: isDragDisabled,
    data: {
      droppableType: 'cell',
      cellIndex,
      orientation,
      libraryId,
    },
  });

  // Check if we're hovering over a full cell
  const isHoveringFull = isOver && isFull && !isDragDisabled;
  const isHoveringValid = isOver && !isFull && !isDragDisabled;

  // Build game IDs list, injecting placeholder for cross-cell drag feedback
  // Using flex-col-reverse/flex-row-reverse lets CSS handle visual reversal
  // while keeping DOM order aligned with what @dnd-kit expects
  const baseGameIds = games.map(g => g.gameId);

  // Inject placeholder if dragging into this cell from elsewhere
  // Use a unique placeholder ID to avoid conflicts with the original item's sortable registration
  const shouldShowPlaceholder =
    dragOverCell?.cellIndex === cellIndex &&
    activeGameId &&
    !baseGameIds.includes(activeGameId);

  const placeholderId = activeGameId ? `placeholder-${activeGameId}` : null;

  const gameIds = shouldShowPlaceholder && placeholderId
    ? [...baseGameIds.slice(0, dragOverCell!.insertionIndex), placeholderId, ...baseGameIds.slice(dragOverCell!.insertionIndex)]
    : baseGameIds;

  // Use orientation-appropriate sorting strategy
  const sortingStrategy = isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative group transition-all duration-200',
        'overflow-hidden'
      )}
      style={{
        // Cubby depth: stronger vignette gradient for recessed back panel
        background: `
          radial-gradient(
            ellipse at center,
            ${backingColor} 20%,
            color-mix(in srgb, ${backingColor} 75%, black) 85%,
            color-mix(in srgb, ${backingColor} 60%, black) 100%
          )
        `,
        // Inner shadow for recessed feeling (top-left light source)
        boxShadow: `
          inset 4px 4px 10px rgba(0,0,0,0.35),
          inset 2px 2px 4px rgba(0,0,0,0.2),
          inset -1px -1px 2px rgba(255,255,255,0.05)
        `,
        width: '100%',
        aspectRatio: '1 / 1',
      }}
    >
      {/* Orientation toggle button - top-right corner */}
      {!isDragDisabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleOrientation?.(cellIndex);
          }}
          className={cn(
            'absolute top-1 right-1 z-20 p-1.5 rounded',
            'bg-amber-900/80 text-amber-100',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'hover:bg-amber-800 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-gold'
          )}
          title={isVertical ? 'Switch to horizontal stacking' : 'Switch to vertical stacking'}
          aria-label={`Toggle orientation to ${isVertical ? 'horizontal' : 'vertical'}`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Games container - flex-reverse handles visual order while keeping DOM order for @dnd-kit */}
      <div
        className={cn(
          'absolute inset-0 flex',
          isVertical ? 'flex-col-reverse' : 'flex-row items-end'
        )}
      >
        <SortableContext items={gameIds} strategy={sortingStrategy}>
          {gameIds.map((gameId, index) => {
            // Check if this is a placeholder item (has placeholder- prefix)
            const isPlaceholder = gameId.startsWith('placeholder-');

            if (isPlaceholder && activeGame) {
              // Render placeholder for incoming game
              const dims = getGameDimensions(activeGame);
              // Stacking dimension: always depth (spine thickness) for both orientations
              const stackingPercent = (dims.depthCm / cellSizeCm) * 100;
              // Perpendicular dimension: width for both orientations
              const sizePercent = Math.min(100, (dims.widthCm / cellSizeCm) * 100);

              return (
                <PlaceholderGame
                  key={gameId}
                  gameId={gameId}
                  cellIndex={cellIndex}
                  isVertical={isVertical}
                  stackingPercent={stackingPercent}
                  sizePercent={sizePercent}
                />
              );
            }

            const game = games.find(g => g.gameId === gameId);
            if (!game) return null;

            const dims = getGameDimensions(game);
            // Stacking dimension: always depth (spine thickness) for both orientations
            const stackingPercent = (dims.depthCm / cellSizeCm) * 100;
            // Perpendicular dimension: width for both orientations
            const sizePercent = Math.min(100, (dims.widthCm / cellSizeCm) * 100);

            return (
              <SortableGame
                key={game.gameId}
                game={game}
                index={index}
                cellIndex={cellIndex}
                isVertical={isVertical}
                stackingPercent={stackingPercent}
                sizePercent={sizePercent}
                isDragDisabled={isDragDisabled}
                isBeingDragged={activeGameId === game.gameId}
                onEditItem={onEditItem}
              />
            );
          })}
        </SortableContext>
      </div>

      {/* Drop target overlay for EMPTY cells - hidden once any cell has games */}
      {isEmpty && !hideEmptyPlaceholder && (
        <div
          className={cn(
            'absolute inset-1 flex flex-col items-center justify-center rounded border-2 border-dashed transition-all pointer-events-none',
            isHoveringValid
              ? 'border-gold-400 bg-gold-200/50 scale-[1.02]'
              : 'border-amber-900/20 bg-transparent',
            isReadOnly && 'opacity-40'
          )}
        >
          <Package
            className={cn(
              'w-7 h-7 mb-1.5 transition-all',
              isHoveringValid ? 'text-gold-600 scale-110' : 'text-amber-900/25'
            )}
          />
          <span
            className={cn(
              'text-xs font-semibold transition-all',
              isHoveringValid ? 'text-gold-700' : 'text-amber-900/30'
            )}
          >
            {isReadOnly ? 'Empty' : isHoveringValid ? 'Drop here!' : 'Drag games here'}
          </span>
        </div>
      )}

      {/* Drop target overlay for POPULATED cells */}
      {!isEmpty && isHoveringValid && (
        <div className="absolute inset-0 bg-gold-300/40 border-4 border-gold-400 pointer-events-none z-10" />
      )}

      {/* FULL cell indicator when trying to drop */}
      {isHoveringFull && (
        <div className="absolute inset-0 bg-red-500/30 border-4 border-red-500 pointer-events-none z-10 flex items-center justify-center">
          <div className="bg-red-600 text-white px-3 py-1.5 rounded font-semibold text-sm shadow-lg flex items-center gap-2">
            <X className="w-4 h-4" />
            Cell full
          </div>
        </div>
      )}

    </div>
  );
}
