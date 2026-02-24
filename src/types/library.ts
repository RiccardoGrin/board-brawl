/**
 * Library Types for BoardBrawl Virtual Game Collection
 *
 * Phase 1.1 Data Model:
 * - UserGame: Canonical per-user game metadata (rating, notes, tags, etc.)
 * - Library: Collection container with optional systemKey for protected libraries
 * - LibraryMembership: Links a game to a library (lightweight reference)
 *
 * Phase 2 Additions:
 * - ShelfConfig: Virtual shelf layout configuration
 * - ShelfCell: Individual cell in the shelf grid
 *
 * Firestore Structure:
 * - /users/{uid}/games/{gameId} -> UserGame
 * - /users/{uid}/libraries/{libraryId} -> Library
 * - /users/{uid}/libraries/{libraryId}/items/{gameId} -> LibraryMembership
 * - /users/{uid}/libraries/{libraryId}/shelves/default -> ShelfConfig (single document per library)
 */

export type LibraryId = string;
export type GameId = string;
export type CellIndex = number;

/**
 * Visibility levels for libraries.
 * - public: Visible to anyone with the link via /u/:usercode/library/:libraryId
 * - private: Visible only to the owner
 */
export type LibraryVisibility = 'public' | 'private';

/**
 * View mode for library display.
 * - list: Traditional list/card view (Phase 1)
 * - shelf: Virtual bookshelf grid view (Phase 2)
 */
export type LibraryViewMode = 'list' | 'shelf';

/**
 * Status of a game in the user's collection.
 * - owned: User owns this game
 * - preordered: User has preordered this game
 * - formerlyOwned: User previously owned but sold/traded
 * - played: User has played but doesn't own
 *
 * Note: Wishlist is now a system library, not a status
 */
export type UserGameStatus = 'owned' | 'preordered' | 'formerlyOwned' | 'played';

/** Physical condition of the game */
export type GameCondition = 'new' | 'likeNew' | 'good' | 'fair' | 'worn';

/** Box size classification for shelf visualization (Phase 2) */
export type BoxSizeClass = 'S' | 'M' | 'L' | 'XL' | 'Tall';

/**
 * System library identifiers.
 * - my: The user's main collection (cannot be deleted or renamed)
 * - wishlist: The user's wishlist (cannot be deleted or renamed)
 */
export type SystemLibraryKey = 'my' | 'wishlist';

/**
 * Canonical user-specific game record.
 * Single source of truth for a user's relationship with a game.
 * The same game can appear in multiple libraries, but metadata lives here.
 *
 * Stored at: /users/{uid}/games/{gameId}
 */
export interface UserGame {
  gameId: GameId;
  ownerId: string;

  // Cached Game Data
  gameName: string;
  gameThumbnail?: string;
  gameYear?: number;

  // User Metadata
  status: UserGameStatus;
  myRating?: number;
  favorite: boolean;
  notes?: string;
  tags?: string[];

  // Trade/Sale Flags
  forTrade: boolean;
  forSale: boolean;

  // Physical Attributes (Phase 2 shelf)
  boxSizeClass?: BoxSizeClass;
  boxWidthMm?: number;
  boxHeightMm?: number;
  boxDepthMm?: number;
  condition?: GameCondition;
  language?: string;
  edition?: string;

  // Thumbnail focal point (0-100%, defaults to 50)
  focalPointX?: number;
  focalPointY?: number;

  // Play Tracking
  playCount?: number;
  winCount?: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * A user's game library (collection container).
 * Users have two system libraries (My Library, Wishlist) plus custom ones.
 *
 * Stored at: /users/{uid}/libraries/{libraryId}
 */
export interface Library {
  id: LibraryId;
  ownerId: string;
  name: string;
  description?: string;
  visibility: LibraryVisibility;
  systemKey?: SystemLibraryKey;
  sortOrder?: number;

  // Phase 2: View mode preference
  viewMode?: LibraryViewMode;

  // Phase 2: Shelf Theming
  theme?: {
    frameColor?: string;
    backingColor?: string;
  };

  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a game's membership in a specific library.
 * Lightweight reference - actual game metadata lives in UserGame.
 *
 * Stored at: /users/{uid}/libraries/{libraryId}/items/{gameId}
 */
export interface LibraryMembership {
  gameId: GameId;
  addedAt: string;
  hideFromPublic?: boolean;

  // Cached fields for faster list rendering
  gameName?: string;
  gameThumbnail?: string;
  gameYear?: number;
}

// ============================================================================
// Phase 2: Virtual Shelf Types
// ============================================================================

/**
 * Orientation of games within a shelf cell.
 * - vertical: Games stacked front-to-back (spine facing out) - default
 * - horizontal: Games laid flat on top of each other
 */
export type CellOrientation = 'vertical' | 'horizontal';

/**
 * Individual cell in the shelf grid.
 * Each cell can hold multiple games (stacked based on orientation).
 * Cell index is derived from array position in ShelfConfig.cells.
 */
export interface ShelfCell {
  /** Ordered list of game IDs in this cell (first = front/top) */
  gameIds: GameId[];
  /** How games are arranged in this cell */
  orientation: CellOrientation;
}

/**
 * Virtual shelf configuration for a library.
 * Stores the grid layout and game placements.
 *
 * Grid Layout:
 * - Fixed 4 columns on desktop, 2 columns on mobile (same cells, different display)
 * - Cells numbered in reading order: 0,1,2,3 (row 1), 4,5,6,7 (row 2), etc.
 * - Total cells = rowCount * SHELF_COLUMNS (4)
 *
 * Stored at: /users/{uid}/libraries/{libraryId}/shelves/default (single document per library)
 */
export interface ShelfConfig {
  /** Number of rows in the shelf (columns fixed at 4) */
  rowCount: number;

  /** Array of cells, length = rowCount * 4 */
  cells: ShelfCell[];

  /** ISO timestamp when shelf was created */
  createdAt: string;

  /** ISO timestamp when shelf was last modified */
  updatedAt: string;
}

// ============================================================================
// Shelf Constants
// ============================================================================

/** Fixed number of columns for shelf grid (desktop display) */
export const SHELF_COLUMNS = 4;

/** Number of columns on mobile display */
export const SHELF_COLUMNS_MOBILE = 2;

/** Default number of rows for a new shelf */
export const SHELF_DEFAULT_ROWS = 4;

/** Minimum number of rows allowed */
export const SHELF_MIN_ROWS = 1;

/** Maximum number of rows allowed */
export const SHELF_MAX_ROWS = 25;

/** Default shelf theme colors (dark wood aesthetic) */
export const DEFAULT_SHELF_THEME = {
  frameColor: '#3D2314', // Espresso (dark wood frame)
  backingColor: '#6B4423', // Dark walnut (shelf backing)
} as const;

/**
 * Shelf scale constants for realistic game sizing.
 *
 * Game Rendering Strategy:
 * - Cells use CSS Grid with 1fr columns and aspectRatio: 1/1 (square)
 * - Cell pixel size varies with viewport width (responsive)
 * - Games are sized as PERCENTAGES of the cell: (depthCm / cellSizeCm) * 100
 * - This ensures games scale proportionally at any viewport size
 *
 * Example: A 6cm deep game in a 30cm cell = 20% of cell height/width
 * Five 6cm games fill the cell perfectly (5 × 20% = 100%)
 *
 * Phase 3 will use actual box dimensions from BGG, applying the same formula.
 */
export const SHELF_SCALE = {
  /** Standard shelf cell size in cm (mimics IKEA Kallax ~33cm) */
  cellSizeCm: 30,
  /** Default game box width in cm (standard board game) */
  defaultGameWidthCm: 30,
  /** Default game box depth/spine in cm */
  defaultGameDepthCm: 6,
  /** Default game box height in cm */
  defaultGameHeightCm: 30,
  /** Frame thickness in pixels (fixed, not scaled) */
  frameThicknessPx: 16,
  /** Gap between cells in pixels (fixed, not scaled) */
  cellGapPx: 4,
} as const;

/**
 * Calculate total stacking space used by games in a cell.
 * For vertical cells, this is the sum of game depths (spine thickness).
 * For horizontal cells, this is the sum of game widths (lying flat).
 * @param games - Array of games with optional box dimensions
 * @param orientation - Cell orientation (vertical or horizontal)
 * @returns Total stacking dimension in cm
 */
export function calculateUsedDepth(
  games: Array<{ boxWidthMm?: number; boxDepthMm?: number }>,
  _orientation: CellOrientation = 'vertical'
): number {
  // Both orientations stack by depth (spine thickness)
  // Vertical: games stand upright, stacked front-to-back
  // Horizontal: games lie flat, stacked side-by-side (depth is still the stacking dimension)
  return games.reduce((total, game) => {
    const dims = getGameDimensions(game);
    return total + dims.depthCm;
  }, 0);
}

/**
 * Check if a cell can accept another game based on remaining space.
 * @param currentGames - Games currently in the cell
 * @param newGame - The game being added (optional, uses default dimensions if not provided)
 * @param orientation - Cell orientation (vertical or horizontal)
 * @returns true if the game fits
 */
export function canFitGameInCell(
  currentGames: Array<{ boxWidthMm?: number; boxDepthMm?: number }>,
  newGame?: { boxWidthMm?: number; boxDepthMm?: number },
  _orientation: CellOrientation = 'vertical'
): boolean {
  // Both orientations stack by depth (spine thickness)
  const usedDepth = calculateUsedDepth(currentGames);
  const newGameDims = getGameDimensions(newGame);
  return usedDepth + newGameDims.depthCm <= SHELF_SCALE.cellSizeCm;
}

/**
 * Get remaining space in a cell.
 * @param currentGames - Games currently in the cell
 * @param _orientation - Cell orientation (unused, kept for API compatibility)
 * @returns Remaining space in cm
 */
export function getRemainingCellSpace(
  currentGames: Array<{ boxWidthMm?: number; boxDepthMm?: number }>,
  _orientation: CellOrientation = 'vertical'
): number {
  // Both orientations stack by depth
  const usedDepth = calculateUsedDepth(currentGames);
  return Math.max(0, SHELF_SCALE.cellSizeCm - usedDepth);
}

/**
 * Create a default empty shelf cell.
 */
export function createDefaultShelfCell(): ShelfCell {
  return {
    gameIds: [],
    orientation: 'vertical',
  };
}

/**
 * Create an empty shelf configuration with default settings.
 */
export function createDefaultShelfConfig(): Omit<ShelfConfig, 'createdAt' | 'updatedAt'> {
  const totalCells = SHELF_DEFAULT_ROWS * SHELF_COLUMNS;
  return {
    rowCount: SHELF_DEFAULT_ROWS,
    cells: Array.from({ length: totalCells }, () => createDefaultShelfCell()),
  };
}

/**
 * Get game dimensions for shelf rendering.
 * Dimensions are capped at cellSizeCm (30cm) to ensure games always fit in cells.
 * The actual dimensions remain stored in userGames - this only affects display.
 */
export function getGameDimensions(game?: { boxWidthMm?: number; boxHeightMm?: number; boxDepthMm?: number }): {
  widthCm: number;
  depthCm: number;
  heightCm: number;
} {
  const maxCm = SHELF_SCALE.cellSizeCm; // 30cm cap for shelf rendering

  if (game?.boxWidthMm && game?.boxDepthMm && game?.boxHeightMm) {
    return {
      widthCm: Math.min(game.boxWidthMm / 10, maxCm),
      depthCm: Math.min(game.boxDepthMm / 10, maxCm),
      heightCm: Math.min(game.boxHeightMm / 10, maxCm),
    };
  }
  // Default game dimensions
  return {
    widthCm: SHELF_SCALE.defaultGameWidthCm,
    depthCm: SHELF_SCALE.defaultGameDepthCm,
    heightCm: SHELF_SCALE.defaultGameHeightCm,
  };
}


/**
 * Get the row and column for a cell index.
 * @param cellIndex - The cell index (0-based)
 * @param columns - Number of columns (default: SHELF_COLUMNS)
 */
export function getCellPosition(
  cellIndex: CellIndex,
  columns: number = SHELF_COLUMNS
): { row: number; col: number } {
  return {
    row: Math.floor(cellIndex / columns),
    col: cellIndex % columns,
  };
}

/**
 * Get the cell index from row and column.
 * @param row - Row number (0-based)
 * @param col - Column number (0-based)
 * @param columns - Number of columns (default: SHELF_COLUMNS)
 */
export function getCellIndex(
  row: number,
  col: number,
  columns: number = SHELF_COLUMNS
): CellIndex {
  return row * columns + col;
}

/** Default values for a new UserGame */
export const DEFAULT_USER_GAME: Omit<
  UserGame,
  'gameId' | 'ownerId' | 'gameName' | 'createdAt' | 'updatedAt'
> = {
  status: 'owned',
  favorite: false,
  forTrade: false,
  forSale: false,
};

/** Default library configuration for custom libraries */
export const DEFAULT_LIBRARY: Omit<Library, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
  name: 'New Library',
  visibility: 'private',
  sortOrder: 100,
};

/** System library definitions */
export const SYSTEM_LIBRARIES: Record<
  SystemLibraryKey,
  Omit<Library, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
> = {
  my: {
    name: 'My Library',
    visibility: 'public',
    systemKey: 'my',
    sortOrder: 0,
  },
  wishlist: {
    name: 'Wishlist',
    visibility: 'private',
    systemKey: 'wishlist',
    sortOrder: 1,
  },
};

/** Filter options for library list view */
export interface LibraryFilters {
  favorite?: boolean;
  unplayed?: boolean;
  forTrade?: boolean;
  forSale?: boolean;
  search?: string;
}

/** Sort options for library list view */
export type LibrarySortField = 'name' | 'rating' | 'playCount' | 'dateAdded' | 'lastPlayed';
export type LibrarySortDirection = 'asc' | 'desc';

export interface LibrarySort {
  field: LibrarySortField;
  direction: LibrarySortDirection;
}

/** Status display labels */
export const STATUS_LABELS: Record<UserGameStatus, string> = {
  owned: 'Owned',
  preordered: 'Preordered',
  formerlyOwned: 'Previously Owned',
  played: 'Played',
};

/** Status badge colors (Tailwind classes) */
export const STATUS_COLORS: Record<UserGameStatus, string> = {
  owned: 'bg-emerald-100 text-emerald-800',
  preordered: 'bg-blue-100 text-blue-800',
  formerlyOwned: 'bg-gray-100 text-gray-600',
  played: 'bg-purple-100 text-purple-800',
};

/** Condition display labels */
export const CONDITION_LABELS: Record<GameCondition, string> = {
  new: 'New (Sealed)',
  likeNew: 'Like New',
  good: 'Good',
  fair: 'Fair',
  worn: 'Worn',
};

/** Box size display labels */
export const BOX_SIZE_LABELS: Record<BoxSizeClass, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra Large',
  Tall: 'Tall',
};

// Legacy type aliases
export type LibraryItemStatus = UserGameStatus;
export type LibraryItemId = GameId;

/**
 * Combined view of a game in a library context.
 * Used for UI rendering - joins UserGame + LibraryMembership data.
 */
export interface LibraryGameView {
  gameId: GameId;
  gameName: string;
  gameThumbnail?: string;
  gameYear?: number;
  status: UserGameStatus;
  myRating?: number;
  favorite: boolean;
  notes?: string;
  tags?: string[];
  forTrade: boolean;
  forSale: boolean;
  playCount?: number;
  condition?: GameCondition;
  language?: string;
  edition?: string;
  boxSizeClass?: BoxSizeClass;

  // Box dimensions (for shelf rendering)
  boxWidthMm?: number;
  boxHeightMm?: number;
  boxDepthMm?: number;

  // Thumbnail focal point (0-100%, defaults to 50)
  focalPointX?: number;
  focalPointY?: number;

  libraryId: LibraryId;
  addedAt: string;
  hideFromPublic?: boolean;

  createdAt: string;
  updatedAt: string;
}
