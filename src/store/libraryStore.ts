/**
 * Library Store (Phase 2)
 *
 * Manages the library data model:
 * - UserGame: Canonical per-user game metadata
 * - Library: Collection containers with system library support
 * - LibraryMembership: Links games to libraries
 * - ShelfConfig: Virtual shelf layout configuration (Phase 2)
 *
 * Key Features:
 * - Guest mode is blocked for library additions (must sign in)
 * - Game metadata (rating, notes) lives in UserGame, not per-library
 * - Same game can appear in multiple libraries with shared metadata
 * - Shelf configuration with debounced sync for drag-drop operations
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Library,
  LibraryId,
  UserGame,
  GameId,
  LibraryMembership,
  LibraryGameView,
  LibraryVisibility,
  LibraryViewMode,
  LibraryFilters,
  LibrarySort,
  ShelfConfig,
  ShelfCell,
  CellIndex,
} from '../types/library';
import {
  DEFAULT_USER_GAME,
  createDefaultShelfConfig,
  createDefaultShelfCell,
  SHELF_COLUMNS,
  SHELF_MIN_ROWS,
  SHELF_MAX_ROWS,
  SHELF_SCALE,
  canFitGameInCell,
  calculateUsedDepth,
  getGameDimensions,
} from '../types/library';
import { useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';
import {
  syncLibrary,
  deleteLibrary as deleteLibraryRemote,
  syncUserGame,
  deleteUserGame as deleteUserGameRemote,
  syncMembership,
  deleteMembership as deleteMembershipRemote,
  syncShelfDebounced,
  deleteShelf as deleteShelfRemote,
  cancelShelfSyncDebounce,
} from '../services/librarySync';

// ============================================================================
// Utilities
// ============================================================================

const generateId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ============================================================================
// Types
// ============================================================================

interface LibraryStore {
  // State
  libraries: Record<LibraryId, Library>;
  userGames: Record<GameId, UserGame>;
  memberships: Record<LibraryId, LibraryMembership[]>;
  shelves: Record<LibraryId, ShelfConfig | null>;
  filters: LibraryFilters;
  sort: LibrarySort;
  lastVisitedLibraryId: LibraryId | null;

  // Library Actions
  createLibrary: (name: string, visibility?: LibraryVisibility) => LibraryId | null;
  updateLibrary: (id: LibraryId, updates: Partial<Pick<Library, 'name' | 'description' | 'visibility' | 'viewMode' | 'theme'>>) => void;
  deleteLibrary: (id: LibraryId) => void;
  setLibraryViewMode: (libraryId: LibraryId, viewMode: LibraryViewMode) => void;

  // UserGame Actions
  addGameToLibrary: (
    libraryId: LibraryId,
    game: {
      gameId: string;
      gameName: string;
      gameThumbnail?: string;
      gameYear?: number;
    },
    options?: Partial<Omit<UserGame, 'gameId' | 'ownerId' | 'gameName' | 'createdAt' | 'updatedAt'>>
  ) => boolean;
  updateUserGame: (gameId: GameId, updates: Partial<Omit<UserGame, 'gameId' | 'ownerId' | 'createdAt'>>) => void;
  removeGameFromLibrary: (libraryId: LibraryId, gameId: GameId) => void;
  deleteUserGameEntirely: (gameId: GameId) => void;

  // Membership Actions
  updateMembership: (libraryId: LibraryId, gameId: GameId, updates: Partial<LibraryMembership>) => void;

  // Shelf Actions (Phase 2)
  initializeShelf: (libraryId: LibraryId) => void;
  addShelfRow: (libraryId: LibraryId) => boolean;
  removeShelfRow: (libraryId: LibraryId) => boolean;
  moveGameToCell: (libraryId: LibraryId, gameId: GameId, targetCellIndex: CellIndex, position?: number) => boolean;
  moveGameBetweenCells: (libraryId: LibraryId, gameId: GameId, fromCellIndex: CellIndex, toCellIndex: CellIndex, toPosition?: number) => boolean;
  reorderGamesInCell: (libraryId: LibraryId, cellIndex: CellIndex, gameIds: GameId[]) => void;
  removeGameFromShelf: (libraryId: LibraryId, gameId: GameId) => void;
  toggleCellOrientation: (libraryId: LibraryId, cellIndex: CellIndex) => void;
  canCellAcceptGame: (libraryId: LibraryId, cellIndex: CellIndex, gameId?: GameId) => boolean;
  batchAddGamesToShelf: (libraryId: LibraryId, gameIds: GameId[]) => { placed: number; overflow: number };

  // Filter & Sort Actions
  setFilters: (filters: LibraryFilters) => void;
  clearFilters: () => void;
  setSort: (sort: LibrarySort) => void;

  // Navigation Actions
  setLastVisitedLibraryId: (libraryId: LibraryId | null) => void;

  // Getters
  getLibrary: (id: LibraryId) => Library | undefined;
  getMyLibrary: () => Library | undefined;
  getWishlistLibrary: () => Library | undefined;
  getLibraryItems: (libraryId: LibraryId) => LibraryGameView[];
  getFilteredItems: (libraryId: LibraryId) => LibraryGameView[];
  isGameInLibrary: (libraryId: LibraryId, gameId: string) => boolean;
  getGameLibraryIds: (gameId: string) => LibraryId[];
  getLibraryGameCount: (libraryId: LibraryId) => number;

  // Shelf Getters (Phase 2)
  getShelf: (libraryId: LibraryId) => ShelfConfig | null;
  getShelfCell: (libraryId: LibraryId, cellIndex: CellIndex) => ShelfCell | null;
  getUnplacedGames: (libraryId: LibraryId) => LibraryGameView[];
  getPlacedGameIds: (libraryId: LibraryId) => Set<GameId>;
  getCellGames: (libraryId: LibraryId, cellIndex: CellIndex) => LibraryGameView[];

  // Cleanup utility
  cleanupOrphanedShelfGames: () => number;

  // Hydration
  hydrateFromSnapshot: (payload: {
    libraries: Record<LibraryId, Library>;
    userGames: Record<GameId, UserGame>;
    memberships: Record<LibraryId, LibraryMembership[]>;
    shelves?: Record<LibraryId, ShelfConfig | null>;
  }) => void;

  resetStore: () => void;
}

// ============================================================================
// Sync Helpers
// ============================================================================

const maybeSyncLibrary = async (get: () => LibraryStore, libraryId: LibraryId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  const library = get().libraries[libraryId];
  if (!library) return;

  try {
    sync.start();
    await syncLibrary(user.uid, library);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] syncLibrary failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

const maybeSyncUserGame = async (get: () => LibraryStore, gameId: GameId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  const userGame = get().userGames[gameId];
  if (!userGame) return;

  try {
    sync.start();
    await syncUserGame(user.uid, userGame);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] syncUserGame failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

const maybeSyncMembership = async (
  get: () => LibraryStore,
  libraryId: LibraryId,
  gameId: GameId
) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  const memberships = get().memberships[libraryId] || [];
  const membership = memberships.find((m) => m.gameId === gameId);
  if (!membership) return;

  try {
    sync.start();
    await syncMembership(user.uid, libraryId, membership);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] syncMembership failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

const maybeDeleteLibraryRemote = async (libraryId: LibraryId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  try {
    sync.start();
    await deleteLibraryRemote(user.uid, libraryId);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] deleteLibrary failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

const maybeDeleteUserGameRemote = async (gameId: GameId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  try {
    sync.start();
    await deleteUserGameRemote(user.uid, gameId);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] deleteUserGame failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

const maybeDeleteMembershipRemote = async (libraryId: LibraryId, gameId: GameId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const sync = useSyncStore.getState();
  try {
    sync.start();
    await deleteMembershipRemote(user.uid, libraryId, gameId);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] deleteMembership failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

/**
 * Sync shelf configuration with debouncing.
 * Uses 500ms debounce to batch rapid drag-drop operations.
 */
const maybeSyncShelfDebounced = (get: () => LibraryStore, libraryId: LibraryId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  const shelf = get().shelves[libraryId];
  if (!shelf) return;

  const sync = useSyncStore.getState();

  syncShelfDebounced(
    user.uid,
    libraryId,
    shelf,
    () => {
      sync.success();
    },
    (error) => {
      console.error('[libraryStore] syncShelf failed:', error);
      sync.fail('Shelf sync failed. Your changes are saved locally.');
    }
  );

  // Mark sync as in progress (will be resolved by callback)
  sync.start();
};

const maybeDeleteShelfRemote = async (libraryId: LibraryId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;

  // Cancel any pending debounced sync
  cancelShelfSyncDebounce(libraryId);

  const sync = useSyncStore.getState();
  try {
    sync.start();
    await deleteShelfRemote(user.uid, libraryId);
    sync.success();
  } catch (error: unknown) {
    console.error('[libraryStore] deleteShelf failed:', error);
    sync.fail('Sync failed. Your changes are saved locally.');
  }
};

// ============================================================================
// Filter & Sort Logic
// ============================================================================

const applyFilters = (items: LibraryGameView[], filters: LibraryFilters): LibraryGameView[] => {
  return items.filter((item) => {
    if (filters.favorite && !item.favorite) return false;
    if (filters.unplayed && (item.playCount ?? 0) > 0) return false;
    if (filters.forTrade && !item.forTrade) return false;
    if (filters.forSale && !item.forSale) return false;

    if (filters.search) {
      const search = filters.search.toLowerCase();
      const nameMatch = item.gameName.toLowerCase().includes(search);
      const notesMatch = item.notes?.toLowerCase().includes(search);
      const tagsMatch = item.tags?.some((tag) => tag.toLowerCase().includes(search));
      if (!nameMatch && !notesMatch && !tagsMatch) return false;
    }

    return true;
  });
};

const applySort = (items: LibraryGameView[], sort: LibrarySort): LibraryGameView[] => {
  const sorted = [...items];
  const { field, direction } = sort;
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (field) {
      case 'name':
        return multiplier * a.gameName.localeCompare(b.gameName);
      case 'rating':
        return multiplier * ((a.myRating ?? 0) - (b.myRating ?? 0));
      case 'playCount':
        return multiplier * ((a.playCount ?? 0) - (b.playCount ?? 0));
      case 'dateAdded':
        return multiplier * (new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
      case 'lastPlayed':
        // For now, use addedAt as fallback (lastPlayed tracking in future phase)
        return multiplier * (new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
      default:
        return 0;
    }
  });

  return sorted;
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      libraries: {},
      userGames: {},
      memberships: {},
      shelves: {},
      filters: {},
      sort: { field: 'name', direction: 'asc' },
      lastVisitedLibraryId: null,

      // ==================== Library Actions ====================

      createLibrary: (name, visibility = 'private') => {
        const user = useAuthStore.getState().user;
        if (!user) {
          console.warn('[libraryStore] Cannot create library: user not signed in');
          return null;
        }

        const id = generateId();
        const now = nowIso();

        const library: Library = {
          id,
          ownerId: user.uid,
          name,
          visibility,
          sortOrder: Object.keys(get().libraries).length + 10,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          libraries: { ...state.libraries, [id]: library },
          memberships: { ...state.memberships, [id]: [] },
        }));

        void maybeSyncLibrary(get, id);
        return id;
      },

      updateLibrary: (id, updates) => {
        const library = get().libraries[id];
        if (!library) return;

        // Prevent renaming system libraries
        if (library.systemKey && updates.name && updates.name !== library.name) {
          console.warn('[libraryStore] Cannot rename system library');
          return;
        }

        set((state) => ({
          libraries: {
            ...state.libraries,
            [id]: {
              ...library,
              ...updates,
              updatedAt: nowIso(),
            },
          },
        }));

        void maybeSyncLibrary(get, id);
      },

      deleteLibrary: (id) => {
        const library = get().libraries[id];
        if (!library) return;

        // Prevent deleting system libraries
        if (library.systemKey) {
          console.warn('[libraryStore] Cannot delete system library');
          return;
        }

        set((state) => {
          const newLibraries = { ...state.libraries };
          delete newLibraries[id];

          const newMemberships = { ...state.memberships };
          delete newMemberships[id];

          const newShelves = { ...state.shelves };
          delete newShelves[id];

          return {
            libraries: newLibraries,
            memberships: newMemberships,
            shelves: newShelves,
          };
        });

        void maybeDeleteLibraryRemote(id);
        void maybeDeleteShelfRemote(id);
      },

      setLibraryViewMode: (libraryId, viewMode) => {
        const library = get().libraries[libraryId];
        if (!library) return;

        // If switching to shelf view and no shelf exists, initialize one
        if (viewMode === 'shelf' && !get().shelves[libraryId]) {
          get().initializeShelf(libraryId);
        }

        set((state) => ({
          libraries: {
            ...state.libraries,
            [libraryId]: {
              ...library,
              viewMode,
              updatedAt: nowIso(),
            },
          },
        }));

        void maybeSyncLibrary(get, libraryId);
      },

      // ==================== UserGame Actions ====================

      addGameToLibrary: (libraryId, game, options = {}) => {
        const user = useAuthStore.getState().user;
        if (!user) {
          console.warn('[libraryStore] Cannot add game: user not signed in');
          return false;
        }

        const now = nowIso();
        const existingGame = get().userGames[game.gameId];

        // Create or update UserGame
        const userGame: UserGame = existingGame
          ? { ...existingGame, ...options, updatedAt: now }
          : {
              gameId: game.gameId,
              ownerId: user.uid,
              gameName: game.gameName,
              gameThumbnail: game.gameThumbnail,
              gameYear: game.gameYear,
              ...DEFAULT_USER_GAME,
              ...options,
              createdAt: now,
              updatedAt: now,
            };

        // Create membership
        const membership: LibraryMembership = {
          gameId: game.gameId,
          addedAt: now,
          gameName: game.gameName,
          gameThumbnail: game.gameThumbnail,
          gameYear: game.gameYear,
        };

        set((state) => {
          const libraryMemberships = state.memberships[libraryId] || [];
          // Check if already in library
          if (libraryMemberships.some((m) => m.gameId === game.gameId)) {
            return state; // Already exists
          }

          return {
            userGames: { ...state.userGames, [game.gameId]: userGame },
            memberships: {
              ...state.memberships,
              [libraryId]: [...libraryMemberships, membership],
            },
          };
        });

        // Sync to Firestore
        void (async () => {
          await maybeSyncUserGame(get, game.gameId);
          await maybeSyncMembership(get, libraryId, game.gameId);
        })();

        return true;
      },

      updateUserGame: (gameId, updates) => {
        const existing = get().userGames[gameId];
        if (!existing) return;

        set((state) => ({
          userGames: {
            ...state.userGames,
            [gameId]: {
              ...existing,
              ...updates,
              updatedAt: nowIso(),
            },
          },
        }));

        void maybeSyncUserGame(get, gameId);
      },

      removeGameFromLibrary: (libraryId, gameId) => {
        set((state) => {
          const libraryMemberships = state.memberships[libraryId] || [];

          // Also remove from shelf if it exists
          const shelf = state.shelves[libraryId];
          const newShelves = shelf
            ? {
                ...state.shelves,
                [libraryId]: {
                  ...shelf,
                  cells: shelf.cells.map((cell) => ({
                    ...cell,
                    gameIds: cell.gameIds.filter((id) => id !== gameId),
                  })),
                  updatedAt: nowIso(),
                },
              }
            : state.shelves;

          return {
            memberships: {
              ...state.memberships,
              [libraryId]: libraryMemberships.filter((m) => m.gameId !== gameId),
            },
            shelves: newShelves,
          };
        });

        // Sync shelf changes
        if (get().shelves[libraryId]) {
          maybeSyncShelfDebounced(get, libraryId);
        }

        void maybeDeleteMembershipRemote(libraryId, gameId);
      },

      deleteUserGameEntirely: (gameId) => {
        // Remove from all libraries, shelves, and delete the UserGame
        set((state) => {
          const newMemberships = { ...state.memberships };
          for (const libraryId of Object.keys(newMemberships)) {
            newMemberships[libraryId] = newMemberships[libraryId].filter(
              (m) => m.gameId !== gameId
            );
          }

          // Also remove from all shelves
          const newShelves = { ...state.shelves };
          for (const libraryId of Object.keys(newShelves)) {
            const shelf = newShelves[libraryId];
            if (shelf) {
              newShelves[libraryId] = {
                ...shelf,
                cells: shelf.cells.map((cell) => ({
                  ...cell,
                  gameIds: cell.gameIds.filter((id) => id !== gameId),
                })),
                updatedAt: nowIso(),
              };
            }
          }

          const newUserGames = { ...state.userGames };
          delete newUserGames[gameId];

          return {
            userGames: newUserGames,
            memberships: newMemberships,
            shelves: newShelves,
          };
        });

        // Sync shelf changes for all affected libraries
        const currentState = get();
        for (const libraryId of Object.keys(currentState.shelves)) {
          if (currentState.shelves[libraryId]) {
            maybeSyncShelfDebounced(get, libraryId);
          }
        }

        // Delete from all libraries and the UserGame doc
        for (const libraryId of Object.keys(currentState.memberships)) {
          void maybeDeleteMembershipRemote(libraryId, gameId);
        }
        void maybeDeleteUserGameRemote(gameId);
      },

      // ==================== Membership Actions ====================

      updateMembership: (libraryId, gameId, updates) => {
        set((state) => {
          const libraryMemberships = state.memberships[libraryId] || [];
          const membershipIndex = libraryMemberships.findIndex((m) => m.gameId === gameId);
          if (membershipIndex === -1) return state;

          const updatedMemberships = [...libraryMemberships];
          updatedMemberships[membershipIndex] = {
            ...updatedMemberships[membershipIndex],
            ...updates,
          };

          return {
            memberships: {
              ...state.memberships,
              [libraryId]: updatedMemberships,
            },
          };
        });

        void maybeSyncMembership(get, libraryId, gameId);
      },

      // ==================== Shelf Actions (Phase 2) ====================

      initializeShelf: (libraryId) => {
        // Don't re-initialize if shelf already exists
        if (get().shelves[libraryId]) return;

        const now = nowIso();
        const defaultConfig = createDefaultShelfConfig();
        const shelf: ShelfConfig = {
          ...defaultConfig,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: shelf,
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
      },

      addShelfRow: (libraryId) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return false;

        // Check max rows limit
        if (shelf.rowCount >= SHELF_MAX_ROWS) {
          console.warn('[libraryStore] Cannot add row: max rows reached');
          return false;
        }

        const newRowCount = shelf.rowCount + 1;
        const newCells: ShelfCell[] = [
          ...shelf.cells,
          // Add 4 empty cells for the new row (with orientation)
          createDefaultShelfCell(),
          createDefaultShelfCell(),
          createDefaultShelfCell(),
          createDefaultShelfCell(),
        ];

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              rowCount: newRowCount,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
        return true;
      },

      removeShelfRow: (libraryId) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return false;

        // Check min rows limit
        if (shelf.rowCount <= SHELF_MIN_ROWS) {
          console.warn('[libraryStore] Cannot remove row: min rows reached');
          return false;
        }

        const newRowCount = shelf.rowCount - 1;
        const lastRowStartIndex = newRowCount * SHELF_COLUMNS;

        // Collect games from the row being removed to move to unplaced
        const removedCells = shelf.cells.slice(lastRowStartIndex);
        const gamesBeingRemoved = removedCells.flatMap((cell) => cell.gameIds);

        // Remove the last row (4 cells)
        const newCells = shelf.cells.slice(0, lastRowStartIndex);

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              rowCount: newRowCount,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        if (gamesBeingRemoved.length > 0) {
          console.log('[libraryStore] Games moved to unplaced:', gamesBeingRemoved);
        }

        maybeSyncShelfDebounced(get, libraryId);
        return true;
      },

      moveGameToCell: (libraryId, gameId, targetCellIndex, position) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return false;

        // Validate cell index
        if (targetCellIndex < 0 || targetCellIndex >= shelf.cells.length) {
          console.warn('[libraryStore] Invalid target cell index');
          return false;
        }

        // Check if target cell can accept more games (using dimension-based calculation)
        const targetCell = shelf.cells[targetCellIndex];
        const isAlreadyInTarget = targetCell.gameIds.includes(gameId);

        if (!isAlreadyInTarget) {
          // Get game objects for dimension calculation
          const userGames = get().userGames;
          const currentGamesInCell = targetCell.gameIds.map(id => userGames[id]).filter(Boolean);
          const newGame = userGames[gameId];

          if (!canFitGameInCell(currentGamesInCell, newGame, targetCell.orientation)) {
            console.warn('[libraryStore] Cannot move game: cell is full (not enough space)');
            return false;
          }
        }

        // First, remove the game from any existing cell (preserving orientation)
        const newCells = shelf.cells.map((cell) => ({
          ...cell,
          gameIds: cell.gameIds.filter((id) => id !== gameId),
        }));

        // Then add to the target cell at specified position or end
        const targetGameIds = [...newCells[targetCellIndex].gameIds];
        if (position !== undefined && position >= 0 && position <= targetGameIds.length) {
          targetGameIds.splice(position, 0, gameId);
        } else {
          targetGameIds.push(gameId);
        }
        newCells[targetCellIndex] = {
          ...newCells[targetCellIndex],
          gameIds: targetGameIds,
        };

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
        return true;
      },

      moveGameBetweenCells: (libraryId, gameId, fromCellIndex, toCellIndex, toPosition) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return false;

        // Validate cell indices
        if (
          fromCellIndex < 0 ||
          fromCellIndex >= shelf.cells.length ||
          toCellIndex < 0 ||
          toCellIndex >= shelf.cells.length
        ) {
          console.warn('[libraryStore] Invalid cell index');
          return false;
        }

        // Check if target cell can accept more games (unless moving within same cell)
        if (fromCellIndex !== toCellIndex) {
          const targetCell = shelf.cells[toCellIndex];
          const userGames = get().userGames;
          const currentGamesInCell = targetCell.gameIds.map(id => userGames[id]).filter(Boolean);
          const newGame = userGames[gameId];

          if (!canFitGameInCell(currentGamesInCell, newGame, targetCell.orientation)) {
            console.warn('[libraryStore] Cannot move game: target cell is full (not enough space)');
            return false;
          }
        }

        // Preserve orientation when copying cells
        const newCells = [...shelf.cells.map((cell) => ({
          ...cell,
          gameIds: [...cell.gameIds]
        }))];

        // Remove from source cell
        const fromCell = newCells[fromCellIndex];
        const gameIndex = fromCell.gameIds.indexOf(gameId);
        if (gameIndex === -1) return false;
        fromCell.gameIds.splice(gameIndex, 1);

        // Add to target cell at specified position or end
        const toCell = newCells[toCellIndex];
        if (toPosition !== undefined && toPosition >= 0 && toPosition <= toCell.gameIds.length) {
          toCell.gameIds.splice(toPosition, 0, gameId);
        } else {
          toCell.gameIds.push(gameId);
        }

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
        return true;
      },

      reorderGamesInCell: (libraryId, cellIndex, gameIds) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return;

        if (cellIndex < 0 || cellIndex >= shelf.cells.length) {
          console.warn('[libraryStore] Invalid cell index');
          return;
        }

        // Preserve orientation when copying cells
        const newCells = [...shelf.cells.map((cell) => ({ 
          ...cell,
          gameIds: [...cell.gameIds] 
        }))];
        newCells[cellIndex] = { 
          ...newCells[cellIndex],
          gameIds 
        };

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
      },

      removeGameFromShelf: (libraryId, gameId) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return;

        // Preserve orientation when copying cells
        const newCells = shelf.cells.map((cell) => ({
          ...cell,
          gameIds: cell.gameIds.filter((id) => id !== gameId),
        }));

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
      },

      toggleCellOrientation: (libraryId, cellIndex) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return;

        if (cellIndex < 0 || cellIndex >= shelf.cells.length) {
          console.warn('[libraryStore] Invalid cell index');
          return;
        }

        const currentOrientation = shelf.cells[cellIndex].orientation || 'vertical';
        const newOrientation = currentOrientation === 'vertical' ? 'horizontal' : 'vertical';

        // Preserve all cell data when copying
        const newCells = [...shelf.cells.map((cell) => ({ 
          ...cell,
          gameIds: [...cell.gameIds] 
        }))];
        newCells[cellIndex] = {
          ...newCells[cellIndex],
          orientation: newOrientation,
        };

        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf,
              cells: newCells,
              updatedAt: nowIso(),
            },
          },
        }));

        maybeSyncShelfDebounced(get, libraryId);
      },

      canCellAcceptGame: (libraryId, cellIndex, gameId) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return false;

        if (cellIndex < 0 || cellIndex >= shelf.cells.length) {
          return false;
        }

        const cell = shelf.cells[cellIndex];
        const userGames = get().userGames;
        const currentGamesInCell = cell.gameIds.map(id => userGames[id]).filter(Boolean);
        const newGame = gameId ? userGames[gameId] : undefined;

        return canFitGameInCell(currentGamesInCell, newGame, cell.orientation);
      },

      batchAddGamesToShelf: (libraryId, gameIds) => {
        const state = get();
        let shelf = state.shelves[libraryId];
        const userGames = state.userGames;

        // Initialize shelf if it doesn't exist
        if (!shelf) {
          get().initializeShelf(libraryId);
          shelf = get().shelves[libraryId];
          if (!shelf) {
            return { placed: 0, overflow: gameIds.length };
          }
        }

        // Get games with their dimensions (NO SORTING - preserve input order from Gemini spatial detection)
        const gamesToPlace = gameIds
          .map((id) => ({
            gameId: id,
            userGame: userGames[id],
            dims: getGameDimensions(userGames[id]),
          }))
          .filter((g) => g.userGame); // Only include games that exist in userGames

        // Clone the cells for modification
        let cells = shelf.cells.map((cell) => ({
          ...cell,
          gameIds: [...cell.gameIds],
        }));
        let rowCount = shelf.rowCount;

        const placed: string[] = [];
        const overflow: string[] = [];
        const cellCapacity = SHELF_SCALE.cellSizeCm;

        // Try to place each game
        for (const game of gamesToPlace) {
          let wasPlaced = false;

          // Try each existing cell
          for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
            const cell = cells[cellIndex];
            const currentGamesInCell = cell.gameIds.map((id) => userGames[id]).filter(Boolean);
            const usedDepth = calculateUsedDepth(currentGamesInCell, cell.orientation);
            const remainingSpace = cellCapacity - usedDepth;

            // Check if game fits
            if (game.dims.depthCm <= remainingSpace) {
              cell.gameIds.push(game.gameId);
              placed.push(game.gameId);
              wasPlaced = true;
              break;
            }
          }

          // If not placed, try adding new rows (up to max)
          if (!wasPlaced && rowCount < SHELF_MAX_ROWS) {
            // Add a new row
            rowCount++;
            const newRowCells = Array.from({ length: SHELF_COLUMNS }, () => createDefaultShelfCell());
            cells = [...cells, ...newRowCells];

            // Place in first cell of new row
            const newCellIndex = cells.length - SHELF_COLUMNS;
            cells[newCellIndex].gameIds.push(game.gameId);
            placed.push(game.gameId);
            wasPlaced = true;
          }

          // If still not placed, add to overflow
          if (!wasPlaced) {
            overflow.push(game.gameId);
          }
        }

        // Update the shelf config
        const now = nowIso();
        set((state) => ({
          shelves: {
            ...state.shelves,
            [libraryId]: {
              ...shelf!,
              rowCount,
              cells,
              updatedAt: now,
            },
          },
        }));

        // Sync to Firestore
        maybeSyncShelfDebounced(get, libraryId);

        console.log(`[batchAddGamesToShelf] Placed ${placed.length} games, ${overflow.length} overflow`);

        return { placed: placed.length, overflow: overflow.length };
      },

      // ==================== Filter & Sort Actions ====================

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSort: (sort) => set({ sort }),

      // ==================== Navigation Actions ====================

      setLastVisitedLibraryId: (libraryId) => set({ lastVisitedLibraryId: libraryId }),

      // ==================== Getters ====================

      getLibrary: (id) => get().libraries[id],

      getMyLibrary: () => {
        return Object.values(get().libraries).find((lib) => lib.systemKey === 'my');
      },

      getWishlistLibrary: () => {
        return Object.values(get().libraries).find((lib) => lib.systemKey === 'wishlist');
      },

      getLibraryItems: (libraryId) => {
        const state = get();
        const memberships = state.memberships[libraryId] || [];

        return memberships.map((m) => {
          const userGame = state.userGames[m.gameId];
          return {
            gameId: m.gameId,
            gameName: userGame?.gameName ?? m.gameName ?? 'Unknown Game',
            gameThumbnail: userGame?.gameThumbnail ?? m.gameThumbnail,
            gameYear: userGame?.gameYear ?? m.gameYear,
            status: userGame?.status ?? 'owned',
            myRating: userGame?.myRating,
            favorite: userGame?.favorite ?? false,
            notes: userGame?.notes,
            tags: userGame?.tags,
            forTrade: userGame?.forTrade ?? false,
            forSale: userGame?.forSale ?? false,
            playCount: userGame?.playCount,
            condition: userGame?.condition,
            language: userGame?.language,
            edition: userGame?.edition,
            boxSizeClass: userGame?.boxSizeClass,
            // Box dimensions for shelf rendering
            boxWidthMm: userGame?.boxWidthMm,
            boxHeightMm: userGame?.boxHeightMm,
            boxDepthMm: userGame?.boxDepthMm,
            // Thumbnail focal point
            focalPointX: userGame?.focalPointX,
            focalPointY: userGame?.focalPointY,
            libraryId,
            addedAt: m.addedAt,
            hideFromPublic: m.hideFromPublic,
            createdAt: userGame?.createdAt ?? m.addedAt,
            updatedAt: userGame?.updatedAt ?? m.addedAt,
          } as LibraryGameView;
        });
      },

      getFilteredItems: (libraryId) => {
        const state = get();
        const items = state.getLibraryItems(libraryId);
        const filtered = applyFilters(items, state.filters);
        return applySort(filtered, state.sort);
      },

      isGameInLibrary: (libraryId, gameId) => {
        const memberships = get().memberships[libraryId] || [];
        return memberships.some((m) => m.gameId === gameId);
      },

      getGameLibraryIds: (gameId) => {
        const state = get();
        const libraryIds: LibraryId[] = [];

        for (const [libraryId, memberships] of Object.entries(state.memberships)) {
          if (memberships.some((m) => m.gameId === gameId)) {
            libraryIds.push(libraryId);
          }
        }

        return libraryIds;
      },

      getLibraryGameCount: (libraryId) => {
        const memberships = get().memberships[libraryId] || [];
        return memberships.length;
      },

      // ==================== Shelf Getters (Phase 2) ====================

      getShelf: (libraryId) => {
        return get().shelves[libraryId] ?? null;
      },

      getShelfCell: (libraryId, cellIndex) => {
        const shelf = get().shelves[libraryId];
        if (!shelf || cellIndex < 0 || cellIndex >= shelf.cells.length) {
          return null;
        }
        return shelf.cells[cellIndex];
      },

      getPlacedGameIds: (libraryId) => {
        const shelf = get().shelves[libraryId];
        if (!shelf) return new Set<GameId>();

        const placedIds = new Set<GameId>();
        for (const cell of shelf.cells) {
          for (const gameId of cell.gameIds) {
            placedIds.add(gameId);
          }
        }
        return placedIds;
      },

      getUnplacedGames: (libraryId) => {
        const items = get().getLibraryItems(libraryId);
        const placedIds = get().getPlacedGameIds(libraryId);

        return items.filter((item) => !placedIds.has(item.gameId));
      },

      getCellGames: (libraryId, cellIndex) => {
        const shelf = get().shelves[libraryId];
        if (!shelf || cellIndex < 0 || cellIndex >= shelf.cells.length) {
          return [];
        }

        const cell = shelf.cells[cellIndex];
        const items = get().getLibraryItems(libraryId);
        const itemMap = new Map(items.map((item) => [item.gameId, item]));

        // Return games in the order they appear in the cell
        return cell.gameIds
          .map((gameId) => itemMap.get(gameId))
          .filter((item): item is LibraryGameView => item !== undefined);
      },

      // ==================== Cleanup Utilities ====================

      cleanupOrphanedShelfGames: () => {
        const state = get();
        let orphansRemoved = 0;

        const newShelves = { ...state.shelves };
        const librariesToSync: string[] = [];

        for (const libraryId of Object.keys(newShelves)) {
          const shelf = newShelves[libraryId];
          if (!shelf) continue;

          // Get valid gameIds for this library (games that exist in userGames AND have membership)
          const memberships = state.memberships[libraryId] || [];
          const validGameIds = new Set(
            memberships
              .map((m) => m.gameId)
              .filter((id) => state.userGames[id])
          );

          let shelfModified = false;
          const cleanedCells = shelf.cells.map((cell) => {
            const originalLength = cell.gameIds.length;
            const cleanedGameIds = cell.gameIds.filter((id) => validGameIds.has(id));
            const removed = originalLength - cleanedGameIds.length;

            if (removed > 0) {
              orphansRemoved += removed;
              shelfModified = true;
            }

            return removed > 0 ? { ...cell, gameIds: cleanedGameIds } : cell;
          });

          if (shelfModified) {
            newShelves[libraryId] = {
              ...shelf,
              cells: cleanedCells,
              updatedAt: nowIso(),
            };
            librariesToSync.push(libraryId);
          }
        }

        if (orphansRemoved > 0) {
          set({ shelves: newShelves });

          // Sync affected shelves
          for (const libraryId of librariesToSync) {
            maybeSyncShelfDebounced(get, libraryId);
          }
        }

        return orphansRemoved;
      },

      // ==================== Hydration ====================

      hydrateFromSnapshot: (payload) => {
        set({
          libraries: payload.libraries,
          userGames: payload.userGames,
          memberships: payload.memberships,
          shelves: payload.shelves ?? {},
        });
      },

      resetStore: () => {
        set({
          libraries: {},
          userGames: {},
          memberships: {},
          shelves: {},
          filters: {},
          sort: { field: 'name', direction: 'asc' },
          lastVisitedLibraryId: null,
        });
      },
    }),
    {
      name: 'boardbrawl-library',
      partialize: (state) => ({
        libraries: state.libraries,
        userGames: state.userGames,
        memberships: state.memberships,
        shelves: state.shelves,
        sort: state.sort,
        lastVisitedLibraryId: state.lastVisitedLibraryId,
      }),
    }
  )
);
