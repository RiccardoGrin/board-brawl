/**
 * ShelfView Component (Phase 2 - Enhanced)
 *
 * Renders a virtual bookshelf grid for displaying board games.
 * - 4 columns on desktop, 2 columns on mobile
 * - Fixed-size games with orientation toggle per cell
 * - Drag-and-drop between cells and unplaced games panel
 * - Drop validation (max 5 games per cell)
 * - Sharp corners and thicker frame for realistic appearance
 * - Games can be edited on mobile (only drag is disabled)
 *
 * Uses @dnd-kit for drag-and-drop with DragOverlay for cursor-centered previews.
 */

import { useMemo, useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useLibraryStore } from '../../store/libraryStore';
import { useNotificationStore } from '../../store/notificationStore';
import type {
  LibraryId,
  LibraryGameView,
  ShelfConfig,
  CellOrientation,
} from '../../types/library';
import {
  SHELF_COLUMNS,
  SHELF_COLUMNS_MOBILE,
  SHELF_SCALE,
  DEFAULT_SHELF_THEME,
  canFitGameInCell,
} from '../../types/library';
import { ShelfCell } from './ShelfCell';
import { UnplacedGamesPanel } from './UnplacedGamesPanel';
import { CustomDragOverlay, type DragOverlayOrientation } from './CustomDragOverlay';

/**
 * Context for sharing drag state with child components.
 * Allows cells to know which game is being dragged and adjust their rendering.
 */
interface DragOverCellInfo {
  cellIndex: number;
  insertionIndex: number;
}

interface ShelfDragContextValue {
  activeGameId: string | null;
  activeGame: LibraryGameView | null;
  destinationOrientation: DragOverlayOrientation;
  dragOverCell: DragOverCellInfo | null;
}

const ShelfDragContext = createContext<ShelfDragContextValue>({
  activeGameId: null,
  activeGame: null,
  destinationOrientation: 'vertical',
  dragOverCell: null,
});

export const useShelfDrag = () => useContext(ShelfDragContext);

/**
 * Hook to detect if the viewport is mobile-sized.
 * Uses the same breakpoint as Tailwind's `sm:` (640px).
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    // Set initial value
    setIsMobile(mediaQuery.matches);

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

/**
 * Custom collision detection that prioritizes cursor position.
 * Uses pointerWithin first (pure cursor-based), falling back to
 * closestCenter when cursor is between elements.
 */
const cursorCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCenter(args);
};

interface ShelfViewProps {
  libraryId: LibraryId;
  shelf: ShelfConfig;
  items: LibraryGameView[];
  isReadOnly?: boolean;
  hideUnplacedPanel?: boolean;
  onEditItem?: (item: LibraryGameView) => void;
  onDeleteItem?: (item: LibraryGameView) => void;
  onToggleFavorite?: (item: LibraryGameView) => void;
}

export function ShelfView({
  libraryId,
  shelf,
  items,
  isReadOnly = false,
  hideUnplacedPanel = false,
  onEditItem,
  onDeleteItem,
  onToggleFavorite,
}: ShelfViewProps) {
  // Detect mobile viewport for responsive grid
  const isMobile = useIsMobile();

  // On mobile, drag-drop is disabled but editing is still allowed
  const isDragDisabled = isReadOnly || isMobile;

  // Drag state for custom overlay
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [destinationOrientation, setDestinationOrientation] = useState<DragOverlayOrientation>('vertical');
  const [dragOverCell, setDragOverCell] = useState<DragOverCellInfo | null>(null);
  const [cellSize, setCellSize] = useState<number>(120); // Calculated from grid, default fallback
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);

  // Debounce ref for handleDragOver to prevent rapid state updates
  const lastDragOverUpdateRef = useRef<number>(0);
  const DRAG_OVER_DEBOUNCE_MS = 16; // One frame at 60fps

  // Store actions
  const moveGameToCell = useLibraryStore((state) => state.moveGameToCell);
  const moveGameBetweenCells = useLibraryStore((state) => state.moveGameBetweenCells);
  const reorderGamesInCell = useLibraryStore((state) => state.reorderGamesInCell);
  const removeGameFromShelf = useLibraryStore((state) => state.removeGameFromShelf);
  const toggleCellOrientation = useLibraryStore((state) => state.toggleCellOrientation);
  const getUnplacedGames = useLibraryStore((state) => state.getUnplacedGames);
  const getCellGames = useLibraryStore((state) => state.getCellGames);
  const getLibrary = useLibraryStore((state) => state.getLibrary);
  const getShelfCell = useLibraryStore((state) => state.getShelfCell);
  // Subscribe to userGames to trigger re-render when game data changes (e.g., focal point)
  // We need to subscribe to the entire userGames object so changes trigger re-renders
  const userGames = useLibraryStore((state) => state.userGames);
  // Use void to suppress "unused variable" error - the subscription is what matters
  void userGames;

  // Notifications
  const showNotification = useNotificationStore((state) => state.show);

  // Get library for theme colors
  const library = getLibrary(libraryId);
  const frameColor = library?.theme?.frameColor ?? DEFAULT_SHELF_THEME.frameColor;
  const backingColor = library?.theme?.backingColor ?? DEFAULT_SHELF_THEME.backingColor;

  // Get unplaced games
  const unplacedGames = useMemo(() => {
    return getUnplacedGames(libraryId);
  }, [getUnplacedGames, libraryId, items, shelf]);

  // Find the active game for DragOverlay
  const activeGame = useMemo(() => {
    if (!activeGameId) return null;
    return items.find(g => g.gameId === activeGameId) ?? null;
  }, [activeGameId, items]);

  // Determine column count based on viewport
  const columnCount = isMobile ? SHELF_COLUMNS_MOBILE : SHELF_COLUMNS;

  // Ref for the grid container to calculate cell sizes
  const gridRef = useRef<HTMLDivElement>(null);

  // Configure sensors for pointer-based dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Small distance threshold to differentiate click vs drag
        distance: 5,
      },
    })
  );

  // Track pointer position during drag for accurate overlay positioning
  // This bypasses dnd-kit's internal measurements which can be affected by CSS transforms
  useEffect(() => {
    if (!activeGameId) {
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      setPointerPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [activeGameId]);

  // Track cell size using ResizeObserver for responsive overlay sizing
  useEffect(() => {
    const updateCellSize = () => {
      if (gridRef.current) {
        const gridWidth = gridRef.current.offsetWidth;
        const totalGaps = (columnCount - 1) * SHELF_SCALE.cellGapPx;
        const calculatedCellSize = (gridWidth - totalGaps) / columnCount;
        setCellSize(calculatedCellSize);
      }
    };

    updateCellSize();
    const observer = new ResizeObserver(updateCellSize);
    if (gridRef.current) {
      observer.observe(gridRef.current);
    }
    return () => observer.disconnect();
  }, [columnCount]);

  // Handle drag start - capture which game is being dragged and initial pointer position
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveGameId(active.id as string);

    // Capture initial position immediately from the activator event
    // This eliminates the race condition where overlay wouldn't appear until first pointermove
    const activatorEvent = event.activatorEvent as PointerEvent;
    setPointerPosition({
      x: activatorEvent.clientX,
      y: activatorEvent.clientY,
    });

    // Determine initial orientation from source
    const sourceData = active.data.current as { sourceType: string; cellIndex?: number } | undefined;
    if (sourceData?.sourceType === 'unplaced') {
      setDestinationOrientation('square');
    } else if (sourceData?.cellIndex !== undefined) {
      const cell = getShelfCell(libraryId, sourceData.cellIndex);
      setDestinationOrientation(cell?.orientation ?? 'vertical');
    }
  };

  // Handle drag over - update orientation and calculate insertion index for cross-cell feedback
  const handleDragOver = (event: DragOverEvent) => {
    // Debounce to prevent rapid state updates causing "Maximum update depth exceeded"
    const now = Date.now();
    if (now - lastDragOverUpdateRef.current < DRAG_OVER_DEBOUNCE_MS) {
      return;
    }
    lastDragOverUpdateRef.current = now;

    const { active, over } = event;
    if (!over) {
      setDragOverCell(null);
      return;
    }

    const activeData = active.data.current as {
      sourceType?: string;
      cellIndex?: number;
    } | undefined;

    const overData = over.data.current as {
      droppableType?: string;
      sourceType?: string;
      cellIndex?: number;
      orientation?: CellOrientation;
    } | undefined;

    // Update destination orientation
    if (overData?.droppableType === 'unplaced') {
      setDestinationOrientation('square');
      setDragOverCell(null);
    } else if (overData?.droppableType === 'cell' && overData.orientation) {
      setDestinationOrientation(overData.orientation);
      // Hovering over cell background (not a specific game) - insert at end
      const destCellIndex = overData.cellIndex;
      if (destCellIndex !== undefined) {
        const sourceCellIndex = activeData?.cellIndex;
        // Only show placeholder for cross-cell moves
        if (sourceCellIndex !== destCellIndex || activeData?.sourceType === 'unplaced') {
          const newInsertionIndex = getCellGames(libraryId, destCellIndex).length;
          // Only update if position actually changed to prevent thrashing
          if (dragOverCell?.cellIndex !== destCellIndex || dragOverCell?.insertionIndex !== newInsertionIndex) {
            setDragOverCell({
              cellIndex: destCellIndex,
              insertionIndex: newInsertionIndex,
            });
          }
        } else {
          setDragOverCell(null);
        }
      }
    } else if (overData?.sourceType === 'cell' && overData.cellIndex !== undefined) {
      // Hovering over a sortable game - get cell orientation
      const cell = getShelfCell(libraryId, overData.cellIndex);
      setDestinationOrientation(cell?.orientation ?? 'vertical');

      const overGameId = over.id as string;

      // Ignore if hovering over the placeholder itself - prevents thrashing
      // where inserting placeholder shifts games, cursor moves to different game,
      // insertion index changes, games shift again, infinite loop
      if (overGameId.startsWith('placeholder-')) {
        return;
      }

      // Calculate insertion index for cross-cell feedback
      const sourceCellIndex = activeData?.cellIndex;
      const destCellIndex = overData.cellIndex;

      // Only show placeholder for cross-cell moves (not same-cell reordering)
      if (sourceCellIndex !== destCellIndex || activeData?.sourceType === 'unplaced') {
        const cellGames = getCellGames(libraryId, destCellIndex);
        const insertionIndex = cellGames.findIndex(g => g.gameId === overGameId);
        const newInsertionIndex = insertionIndex !== -1 ? insertionIndex : cellGames.length;

        // Only update if position actually changed to prevent thrashing
        // This stops infinite loops when placeholder shifts game positions
        if (dragOverCell?.cellIndex !== destCellIndex || dragOverCell?.insertionIndex !== newInsertionIndex) {
          setDragOverCell({
            cellIndex: destCellIndex,
            insertionIndex: newInsertionIndex,
          });
        }
      } else {
        setDragOverCell(null);
      }
    } else {
      setDragOverCell(null);
    }
  };

  // Handle drag end - perform the actual move
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state
    setActiveGameId(null);
    setDragOverCell(null);
    setPointerPosition(null);

    if (isDragDisabled || !over) return;

    const gameId = active.id as string;
    const activeData = active.data.current as {
      sourceType: string;
      cellIndex?: number;
      index?: number;
      gameId?: string;
    } | undefined;
    const overData = over.data.current as {
      droppableType?: string;
      sourceType?: string;
      cellIndex?: number;
      index?: number;
      gameId?: string;
    } | undefined;

    if (!activeData) return;

    // Find the game being dragged (for dimension check)
    const draggedGame = items.find(g => g.gameId === gameId);

    const sourceType = activeData.sourceType;

    // Determine destination type and cell index
    // over.data can be from a droppable (cell/unplaced) or a sortable game
    const isOverDroppable = overData?.droppableType !== undefined;
    const isOverSortable = overData?.sourceType === 'cell';

    const destType = isOverDroppable ? overData.droppableType : (isOverSortable ? 'sortable-game' : undefined);
    const destCellIndex = overData?.cellIndex;

    // Moving from unplaced to a cell (drop on empty cell or cell area)
    if (sourceType === 'unplaced' && destType === 'cell' && destCellIndex !== undefined) {
      const cellGames = getCellGames(libraryId, destCellIndex);
      const destCell = getShelfCell(libraryId, destCellIndex);
      const destOrientation = destCell?.orientation || 'vertical';

      if (!canFitGameInCell(cellGames, draggedGame, destOrientation)) {
        showNotification('error', 'Cell is full - not enough space for this game');
        return;
      }
      const success = moveGameToCell(libraryId, gameId, destCellIndex);
      if (!success) {
        showNotification('error', 'Could not place game - cell may be full');
      }
      return;
    }

    // Moving from unplaced to a sortable game (drop on specific game in cell)
    if (sourceType === 'unplaced' && destType === 'sortable-game' && destCellIndex !== undefined) {
      const cellGames = getCellGames(libraryId, destCellIndex);
      const destCell = getShelfCell(libraryId, destCellIndex);
      const destOrientation = destCell?.orientation || 'vertical';
      if (!canFitGameInCell(cellGames, draggedGame, destOrientation)) {
        showNotification('error', 'Cell is full - not enough space for this game');
        return;
      }
      // Insert at the position of the game being hovered over
      const overGameId = over.id as string;
      const gameIds = cellGames.map(g => g.gameId);
      const insertIndex = gameIds.indexOf(overGameId);
      const success = moveGameToCell(libraryId, gameId, destCellIndex, insertIndex !== -1 ? insertIndex : undefined);
      if (!success) {
        showNotification('error', 'Could not place game - cell may be full');
      }
      return;
    }

    // Moving from a cell to unplaced
    if (sourceType === 'cell' && destType === 'unplaced') {
      removeGameFromShelf(libraryId, gameId);
      return;
    }

    // Moving to a sortable game (reordering or cross-cell)
    if (sourceType === 'cell' && destType === 'sortable-game' &&
        activeData.cellIndex !== undefined && destCellIndex !== undefined) {
      const fromCellIndex = activeData.cellIndex;
      const toCellIndex = destCellIndex;

      if (fromCellIndex === toCellIndex) {
        // Reordering within the same cell using arrayMove
        // With flex-reverse, DOM order matches store order, so no reversal needed
        const cellGames = getCellGames(libraryId, fromCellIndex);
        const gameIds = cellGames.map(g => g.gameId);

        const fromIndex = gameIds.indexOf(gameId);
        const overGameId = over.id as string;
        const toIndex = gameIds.indexOf(overGameId);

        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          const newOrder = arrayMove(gameIds, fromIndex, toIndex);
          reorderGamesInCell(libraryId, fromCellIndex, newOrder);
        }
      } else {
        // Moving to a different cell - check capacity
        const targetCellGames = getCellGames(libraryId, toCellIndex);
        const targetCell = getShelfCell(libraryId, toCellIndex);
        const targetOrientation = targetCell?.orientation || 'vertical';
        if (!canFitGameInCell(targetCellGames, draggedGame, targetOrientation)) {
          showNotification('error', 'Target cell is full - not enough space');
          return;
        }

        // Insert at the position of the game being hovered over
        const overGameId = over.id as string;
        const targetGameIds = targetCellGames.map(g => g.gameId);
        const insertIndex = targetGameIds.indexOf(overGameId);
        const success = moveGameBetweenCells(libraryId, gameId, fromCellIndex, toCellIndex, insertIndex !== -1 ? insertIndex : targetCellGames.length);
        if (!success) {
          showNotification('error', 'Could not move game - target cell may be full');
        }
      }
      return;
    }

    // Moving to a cell droppable (empty cell or cell background)
    if (sourceType === 'cell' && destType === 'cell' &&
        activeData.cellIndex !== undefined && destCellIndex !== undefined) {
      const fromCellIndex = activeData.cellIndex;
      const toCellIndex = destCellIndex;

      if (fromCellIndex !== toCellIndex) {
        // Moving to a different cell
        const targetCellGames = getCellGames(libraryId, toCellIndex);
        const targetCell = getShelfCell(libraryId, toCellIndex);
        const targetOrientation = targetCell?.orientation || 'vertical';
        if (!canFitGameInCell(targetCellGames, draggedGame, targetOrientation)) {
          showNotification('error', 'Target cell is full - not enough space');
          return;
        }
        const success = moveGameBetweenCells(libraryId, gameId, fromCellIndex, toCellIndex);
        if (!success) {
          showNotification('error', 'Could not move game - target cell may be full');
        }
      }
      return;
    }
  };

  // Handle orientation toggle
  const handleToggleOrientation = (cellIndex: number) => {
    toggleCellOrientation(libraryId, cellIndex);
  };

  // Generate cell indices for the grid
  const cellIndices = useMemo(() => {
    return Array.from({ length: shelf.cells.length }, (_, i) => i);
  }, [shelf.cells.length]);

  // Check if any cell has games (to hide empty cell placeholders)
  const shelfHasAnyGames = useMemo(() => {
    return shelf.cells.some(cell => cell.gameIds.length > 0);
  }, [shelf]);

  // Context value for child components
  const dragContextValue = useMemo(() => ({
    activeGameId,
    activeGame,
    destinationOrientation,
    dragOverCell,
  }), [activeGameId, activeGame, destinationOrientation, dragOverCell]);

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={cursorCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <ShelfDragContext.Provider value={dragContextValue}>
        <div className="space-y-6">
          {/* Shelf Grid */}
          <div
            className="overflow-hidden shadow-lg relative"
            style={{
              // Solid opaque background to prevent see-through
              backgroundColor: frameColor,
              // Thicker frame for realistic appearance
              padding: `${SHELF_SCALE.frameThicknessPx}px`,
              // Sharp corners - no border radius
              borderRadius: '2px',
            }}
          >
            {/* Wood frame lighting and grain overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                // Wood frame with top-left lighting gradient (warm yellow highlight)
                background: `
                  linear-gradient(
                    135deg,
                    rgba(255, 240, 200, 0.25) 0%,
                    transparent 35%,
                    rgba(0, 0, 0, 0.15) 100%
                  )
                `,
                // Visible wood grain texture overlay
                backgroundImage: `
                  linear-gradient(
                    135deg,
                    rgba(255, 240, 200, 0.25) 0%,
                    transparent 35%,
                    rgba(0, 0, 0, 0.15) 100%
                  ),
                  repeating-linear-gradient(
                    92deg,
                    transparent 0px,
                    transparent 3px,
                    rgba(0,0,0,0.08) 3px,
                    rgba(0,0,0,0.08) 5px,
                    transparent 5px,
                    transparent 12px
                  ),
                  repeating-linear-gradient(
                    0deg,
                    transparent 0px,
                    transparent 20px,
                    rgba(0,0,0,0.04) 20px,
                    rgba(0,0,0,0.04) 22px
                  )
                `,
              }}
            />
            <div
              ref={gridRef}
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: `${SHELF_SCALE.cellGapPx}px`,
              }}
            >
              {cellIndices.map((cellIndex) => {
                const cell = getShelfCell(libraryId, cellIndex);
                // Ensure cell exists with default values
                const safeCell = cell ?? { gameIds: [], orientation: 'vertical' as const };

                return (
                  <ShelfCell
                    key={cellIndex}
                    libraryId={libraryId}
                    cellIndex={cellIndex}
                    cell={safeCell}
                    games={getCellGames(libraryId, cellIndex)}
                    backingColor={backingColor}
                    isReadOnly={isReadOnly}
                    isMobile={isMobile}
                    hideEmptyPlaceholder={shelfHasAnyGames}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                    onToggleFavorite={onToggleFavorite}
                    onToggleOrientation={handleToggleOrientation}
                  />
                );
              })}
            </div>
          </div>

          {/* Mobile read-only info */}
          {isMobile && !isReadOnly && (
            <div className="text-center text-sm text-muted bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
              <p>
                <strong>Tap games to edit.</strong> Switch to desktop to rearrange your shelf.
              </p>
            </div>
          )}

          {/* Unplaced Games Panel */}
          {!hideUnplacedPanel && (
            <UnplacedGamesPanel
              libraryId={libraryId}
              games={unplacedGames}
              isReadOnly={isReadOnly}
              isMobile={isMobile}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
              onToggleFavorite={onToggleFavorite}
            />
          )}
        </div>

      </ShelfDragContext.Provider>
    </DndContext>

    {/* Custom drag overlay - rendered as portal to document.body */}
    {/* Fully independent of dnd-kit positioning, centered on cursor */}
    {activeGame && pointerPosition && (
      <CustomDragOverlay
        game={activeGame}
        orientation={destinationOrientation}
        baseSize={cellSize}
        position={pointerPosition}
      />
    )}
  </>
  );
}
