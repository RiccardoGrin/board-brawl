/**
 * Library Firestore Sync Service (Phase 2)
 *
 * Handles CRUD operations for the library data model:
 * - UserGame: /users/{uid}/games/{gameId} - Canonical game metadata
 * - Library: /users/{uid}/libraries/{libraryId} - Collection containers
 * - LibraryMembership: /users/{uid}/libraries/{libraryId}/items/{gameId} - Links
 * - ShelfConfig: /users/{uid}/libraries/{libraryId}/shelves/default - Virtual shelf layout (Phase 2)
 *
 * Key Features:
 * - Game metadata (rating, notes, etc.) lives in UserGame
 * - LibraryMembership is lightweight (just gameId, addedAt, hideFromPublic)
 * - Same game can appear in multiple libraries with shared metadata
 * - ShelfConfig stores virtual shelf grid layout with debounced sync
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  Library,
  LibraryId,
  UserGame,
  GameId,
  LibraryMembership,
  LibraryGameView,
  ShelfConfig,
} from '../types/library';

// ============================================================================
// Utility Functions
// ============================================================================

/** Convert Firestore Timestamp or string to ISO string */
const toIso = (value: unknown): string | undefined => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return undefined;
};

/** Check if a value is a Firestore FieldValue */
const isFieldValue = (value: unknown) =>
  (value as { _methodName?: string })?._methodName === 'serverTimestamp' ||
  (value as { constructor?: { name?: string } })?.constructor?.name?.includes('FieldValue');

/** Recursively clean an object by removing undefined values */
export const deepClean = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isFieldValue(value) || value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value.map(deepClean).filter((v) => v !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(obj)
        .map(([k, v]) => [k, deepClean(v)])
        .filter(([, v]) => v !== undefined)
    );
  }
  return value;
};

// ============================================================================
// Collection References
// ============================================================================

const getUserGamesCollection = (userId: string) =>
  collection(db, 'users', userId, 'games');

const getUserGameDoc = (userId: string, gameId: GameId) =>
  doc(db, 'users', userId, 'games', gameId);

const getLibrariesCollection = (userId: string) =>
  collection(db, 'users', userId, 'libraries');

const getLibraryDoc = (userId: string, libraryId: LibraryId) =>
  doc(db, 'users', userId, 'libraries', libraryId);

const getMembershipsCollection = (userId: string, libraryId: LibraryId) =>
  collection(db, 'users', userId, 'libraries', libraryId, 'items');

const getMembershipDoc = (userId: string, libraryId: LibraryId, gameId: GameId) =>
  doc(db, 'users', userId, 'libraries', libraryId, 'items', gameId);

const getShelfDoc = (userId: string, libraryId: LibraryId) =>
  doc(db, 'users', userId, 'libraries', libraryId, 'shelves', 'default');

// ============================================================================
// UserGame Operations
// ============================================================================

/**
 * Sync a UserGame document to Firestore.
 * Creates or updates the canonical game metadata for a user.
 */
export async function syncUserGame(userId: string, userGame: UserGame): Promise<void> {
  const gameRef = getUserGameDoc(userId, userGame.gameId);

  const payload = deepClean({
    gameId: userGame.gameId,
    ownerId: userId,
    gameName: userGame.gameName,
    gameThumbnail: userGame.gameThumbnail ?? null,
    gameYear: userGame.gameYear ?? null,
    status: userGame.status,
    myRating: userGame.myRating ?? null,
    favorite: userGame.favorite,
    notes: userGame.notes ?? null,
    tags: userGame.tags ?? null,
    forTrade: userGame.forTrade,
    forSale: userGame.forSale,
    boxSizeClass: userGame.boxSizeClass ?? null,
    boxWidthMm: userGame.boxWidthMm ?? null,
    boxHeightMm: userGame.boxHeightMm ?? null,
    boxDepthMm: userGame.boxDepthMm ?? null,
    condition: userGame.condition ?? null,
    language: userGame.language ?? null,
    edition: userGame.edition ?? null,
    playCount: userGame.playCount ?? null,
    winCount: userGame.winCount ?? null,
    focalPointX: userGame.focalPointX ?? null,
    focalPointY: userGame.focalPointY ?? null,
    createdAt: userGame.createdAt,
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>;

  await setDoc(gameRef, payload, { merge: true });
}

/**
 * Delete a UserGame document from Firestore.
 */
export async function deleteUserGame(userId: string, gameId: GameId): Promise<void> {
  const gameRef = getUserGameDoc(userId, gameId);
  await deleteDoc(gameRef);
}

/**
 * Load all UserGame documents for a user.
 */
export async function loadUserGames(userId: string): Promise<Record<GameId, UserGame>> {
  const gamesCollection = getUserGamesCollection(userId);
  const snapshot = await getDocs(gamesCollection);

  const games: Record<GameId, UserGame> = {};

  for (const gameDoc of snapshot.docs) {
    const data = gameDoc.data();
    games[gameDoc.id] = {
      gameId: gameDoc.id,
      ownerId: data.ownerId ?? userId,
      gameName: data.gameName ?? 'Unknown Game',
      gameThumbnail: data.gameThumbnail,
      gameYear: data.gameYear,
      status: data.status ?? 'owned',
      myRating: data.myRating,
      favorite: data.favorite ?? false,
      notes: data.notes,
      tags: data.tags,
      forTrade: data.forTrade ?? false,
      forSale: data.forSale ?? false,
      boxSizeClass: data.boxSizeClass,
      boxWidthMm: data.boxWidthMm,
      boxHeightMm: data.boxHeightMm,
      boxDepthMm: data.boxDepthMm,
      condition: data.condition,
      language: data.language,
      edition: data.edition,
      playCount: data.playCount,
      winCount: data.winCount,
      focalPointX: data.focalPointX,
      focalPointY: data.focalPointY,
      createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
      updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    };
  }

  return games;
}

// ============================================================================
// Library Operations
// ============================================================================

/**
 * Sync a Library document to Firestore.
 */
export async function syncLibrary(userId: string, library: Library): Promise<void> {
  const libraryRef = getLibraryDoc(userId, library.id);

  const payload = deepClean({
    ownerId: userId,
    name: library.name,
    description: library.description ?? null,
    visibility: library.visibility,
    systemKey: library.systemKey ?? null,
    sortOrder: library.sortOrder ?? 0,
    viewMode: library.viewMode ?? null,
    theme: library.theme ?? null,
    createdAt: library.createdAt,
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>;

  await setDoc(libraryRef, payload, { merge: true });
}

/**
 * Delete a Library and all its memberships from Firestore.
 * Note: System libraries (systemKey set) cannot be deleted via rules.
 */
export async function deleteLibrary(userId: string, libraryId: LibraryId): Promise<void> {
  const batch = writeBatch(db);

  // Get all memberships in the library
  const membershipsCollection = getMembershipsCollection(userId, libraryId);
  const membershipsSnapshot = await getDocs(membershipsCollection);

  // Delete all memberships
  membershipsSnapshot.docs.forEach((membershipDoc) => {
    batch.delete(membershipDoc.ref);
  });

  // Delete the library document
  const libraryRef = getLibraryDoc(userId, libraryId);
  batch.delete(libraryRef);

  await batch.commit();
}

/**
 * Load all Library documents for a user.
 */
export async function loadLibraries(userId: string): Promise<Record<LibraryId, Library>> {
  const librariesCollection = getLibrariesCollection(userId);
  const snapshot = await getDocs(librariesCollection);

  const libraries: Record<LibraryId, Library> = {};

  for (const libraryDoc of snapshot.docs) {
    const data = libraryDoc.data();
    libraries[libraryDoc.id] = {
      id: libraryDoc.id,
      ownerId: data.ownerId ?? userId,
      name: data.name ?? 'Unnamed Library',
      description: data.description,
      visibility: data.visibility ?? 'private',
      systemKey: data.systemKey,
      sortOrder: data.sortOrder ?? 0,
      viewMode: data.viewMode,
      theme: data.theme,
      createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
      updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    };
  }

  return libraries;
}

// ============================================================================
// Library Membership Operations
// ============================================================================

/**
 * Sync a LibraryMembership document to Firestore.
 */
export async function syncMembership(
  userId: string,
  libraryId: LibraryId,
  membership: LibraryMembership
): Promise<void> {
  const membershipRef = getMembershipDoc(userId, libraryId, membership.gameId);

  const payload = deepClean({
    gameId: membership.gameId,
    addedAt: membership.addedAt,
    hideFromPublic: membership.hideFromPublic ?? null,
    gameName: membership.gameName ?? null,
    gameThumbnail: membership.gameThumbnail ?? null,
    gameYear: membership.gameYear ?? null,
  }) as Record<string, unknown>;

  await setDoc(membershipRef, payload, { merge: true });
}

/**
 * Delete a LibraryMembership from Firestore.
 */
export async function deleteMembership(
  userId: string,
  libraryId: LibraryId,
  gameId: GameId
): Promise<void> {
  const membershipRef = getMembershipDoc(userId, libraryId, gameId);
  await deleteDoc(membershipRef);
}

/**
 * Load all memberships for a specific library.
 */
export async function loadMemberships(
  userId: string,
  libraryId: LibraryId
): Promise<LibraryMembership[]> {
  const membershipsCollection = getMembershipsCollection(userId, libraryId);
  const snapshot = await getDocs(membershipsCollection);

  return snapshot.docs.map((membershipDoc) => {
    const data = membershipDoc.data();
    return {
      gameId: membershipDoc.id,
      addedAt: toIso(data.addedAt) ?? new Date().toISOString(),
      hideFromPublic: data.hideFromPublic,
      gameName: data.gameName,
      gameThumbnail: data.gameThumbnail,
      gameYear: data.gameYear,
    };
  });
}

/**
 * Load all memberships for all libraries (for a user).
 * Returns a map of libraryId -> gameId[]
 */
export async function loadAllMemberships(
  userId: string,
  libraryIds: LibraryId[]
): Promise<Record<LibraryId, LibraryMembership[]>> {
  const result: Record<LibraryId, LibraryMembership[]> = {};

  // Load memberships for each library
  await Promise.all(
    libraryIds.map(async (libraryId) => {
      result[libraryId] = await loadMemberships(userId, libraryId);
    })
  );

  return result;
}

// ============================================================================
// Shelf Configuration Operations (Phase 2)
// ============================================================================

/**
 * Sync a ShelfConfig document to Firestore.
 * This should be called with debouncing to avoid excessive writes during drag-drop.
 */
export async function syncShelf(
  userId: string,
  libraryId: LibraryId,
  shelf: ShelfConfig
): Promise<void> {
  const shelfRef = getShelfDoc(userId, libraryId);

  const payload = deepClean({
    rowCount: shelf.rowCount,
    cells: shelf.cells.map((cell) => ({
      gameIds: cell.gameIds,
      orientation: cell.orientation ?? 'vertical',
    })),
    createdAt: shelf.createdAt,
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>;

  await setDoc(shelfRef, payload, { merge: true });
}

/**
 * Load shelf configuration for a library.
 * Returns null if no shelf exists yet.
 */
export async function loadShelf(
  userId: string,
  libraryId: LibraryId
): Promise<ShelfConfig | null> {
  const shelfRef = getShelfDoc(userId, libraryId);
  const shelfDoc = await getDoc(shelfRef);

  if (!shelfDoc.exists()) {
    return null;
  }

  const data = shelfDoc.data();
  return {
    rowCount: data.rowCount ?? 4,
    cells: (data.cells ?? []).map((cell: { gameIds?: string[]; orientation?: string }) => ({
      gameIds: cell.gameIds ?? [],
      orientation: (cell.orientation as 'vertical' | 'horizontal') ?? 'vertical',
    })),
    createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
  };
}

/**
 * Delete shelf configuration for a library.
 */
export async function deleteShelf(
  userId: string,
  libraryId: LibraryId
): Promise<void> {
  const shelfRef = getShelfDoc(userId, libraryId);
  await deleteDoc(shelfRef);
}

/**
 * Load all shelf configurations for all libraries.
 * Returns a map of libraryId -> ShelfConfig (or undefined if no shelf).
 */
export async function loadAllShelves(
  userId: string,
  libraryIds: LibraryId[]
): Promise<Record<LibraryId, ShelfConfig | null>> {
  const result: Record<LibraryId, ShelfConfig | null> = {};

  await Promise.all(
    libraryIds.map(async (libraryId) => {
      result[libraryId] = await loadShelf(userId, libraryId);
    })
  );

  return result;
}

// ============================================================================
// Shelf Debounce Utility
// ============================================================================

/** Map of libraryId -> pending timeout for debounced shelf sync */
const shelfSyncTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

/** Debounce delay for shelf sync (milliseconds) */
const SHELF_SYNC_DEBOUNCE_MS = 500;

/**
 * Sync shelf with debouncing.
 * Multiple rapid calls will be batched into a single Firestore write.
 * 
 * @param userId - User ID
 * @param libraryId - Library ID
 * @param shelf - Shelf configuration to sync
 * @param onSync - Optional callback when sync completes (for updating sync status)
 * @param onError - Optional callback when sync fails
 */
export function syncShelfDebounced(
  userId: string,
  libraryId: LibraryId,
  shelf: ShelfConfig,
  onSync?: () => void,
  onError?: (error: Error) => void
): void {
  // Clear any pending timeout for this library
  const existingTimeout = shelfSyncTimeouts.get(libraryId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout
  const timeout = setTimeout(async () => {
    shelfSyncTimeouts.delete(libraryId);
    try {
      await syncShelf(userId, libraryId, shelf);
      onSync?.();
    } catch (error) {
      console.error('[librarySync] Debounced shelf sync failed:', error);
      onError?.(error as Error);
    }
  }, SHELF_SYNC_DEBOUNCE_MS);

  shelfSyncTimeouts.set(libraryId, timeout);
}

/**
 * Cancel any pending debounced shelf sync for a library.
 * Call this when navigating away or when immediate sync is needed.
 */
export function cancelShelfSyncDebounce(libraryId: LibraryId): void {
  const existingTimeout = shelfSyncTimeouts.get(libraryId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    shelfSyncTimeouts.delete(libraryId);
  }
}

/**
 * Flush any pending debounced shelf sync immediately.
 * Returns a promise that resolves when the sync completes.
 */
export async function flushShelfSync(
  userId: string,
  libraryId: LibraryId,
  shelf: ShelfConfig
): Promise<void> {
  cancelShelfSyncDebounce(libraryId);
  await syncShelf(userId, libraryId, shelf);
}

// ============================================================================
// Combined Loading (for initial sync)
// ============================================================================

export interface LibrarySnapshot {
  libraries: Record<LibraryId, Library>;
  userGames: Record<GameId, UserGame>;
  memberships: Record<LibraryId, LibraryMembership[]>;
  shelves: Record<LibraryId, ShelfConfig | null>;
}

/**
 * Load all library data for a user (libraries, games, memberships, shelves).
 * Used during initial sync when user signs in.
 */
export async function loadLibraryDataRemote(userId: string): Promise<LibrarySnapshot> {
  // Load libraries and games in parallel
  const [libraries, userGames] = await Promise.all([
    loadLibraries(userId),
    loadUserGames(userId),
  ]);

  // Load memberships and shelves for all libraries in parallel
  const libraryIds = Object.keys(libraries);
  const [memberships, shelves] = await Promise.all([
    loadAllMemberships(userId, libraryIds),
    loadAllShelves(userId, libraryIds),
  ]);

  // Enrich memberships with canonical game data
  for (const libraryId of libraryIds) {
    const libraryMemberships = memberships[libraryId] || [];
    memberships[libraryId] = libraryMemberships.map((m) => {
      const userGame = userGames[m.gameId];
      if (userGame) {
        return {
          ...m,
          gameName: m.gameName ?? userGame.gameName,
          gameThumbnail: m.gameThumbnail ?? userGame.gameThumbnail,
          gameYear: m.gameYear ?? userGame.gameYear,
        };
      }
      return m;
    });
  }

  return { libraries, userGames, memberships, shelves };
}

// ============================================================================
// Public Library Access
// ============================================================================

/**
 * Load all public libraries for a user (for profile page).
 * Returns libraries where visibility === 'public'.
 */
export async function loadPublicLibrariesForUser(userId: string): Promise<Library[]> {
  const librariesCollection = getLibrariesCollection(userId);
  const q = query(librariesCollection, where('visibility', '==', 'public'));
  const snapshot = await getDocs(q);

  const libraries: Library[] = [];

  for (const libraryDoc of snapshot.docs) {
    const data = libraryDoc.data();
    libraries.push({
      id: libraryDoc.id,
      ownerId: data.ownerId ?? userId,
      name: data.name ?? 'Unnamed Library',
      description: data.description,
      visibility: 'public',
      systemKey: data.systemKey,
      sortOrder: data.sortOrder ?? 0,
      viewMode: data.viewMode,
      theme: data.theme,
      createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
      updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    });
  }

  // Sort by sortOrder
  libraries.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return libraries;
}

/**
 * Load a single library by ID (for public access).
 * Returns the library, its memberships, shelf config, and relevant game data.
 */
export async function loadPublicLibrary(
  userId: string,
  libraryId: LibraryId
): Promise<{
  library: Library | null;
  items: LibraryGameView[];
  shelf: ShelfConfig | null;
}> {
  // Load library document
  const libraryRef = getLibraryDoc(userId, libraryId);
  const libraryDoc = await getDoc(libraryRef);

  if (!libraryDoc.exists()) {
    return { library: null, items: [], shelf: null };
  }

  const data = libraryDoc.data();
  const library: Library = {
    id: libraryDoc.id,
    ownerId: data.ownerId ?? userId,
    name: data.name ?? 'Unnamed Library',
    description: data.description,
    visibility: data.visibility ?? 'private',
    systemKey: data.systemKey,
    sortOrder: data.sortOrder ?? 0,
    viewMode: data.viewMode,
    theme: data.theme,
    createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
  };

  // If private, return empty items (rules should block this anyway)
  if (library.visibility !== 'public') {
    return { library, items: [], shelf: null };
  }

  // Load memberships, user games, and shelf in parallel
  const [memberships, userGames, shelf] = await Promise.all([
    loadMemberships(userId, libraryId),
    loadUserGames(userId),
    loadShelf(userId, libraryId),
  ]);

  // Build LibraryGameView items, filtering out hidden ones
  const items: LibraryGameView[] = memberships
    .filter((m) => !m.hideFromPublic)
    .map((m) => {
      const userGame = userGames[m.gameId];
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
      };
    });

  return { library, items, shelf };
}

// ============================================================================
// User Code Lookups
// ============================================================================

/**
 * Lookup user by their player code (for public library access).
 * Returns the user's UID if found.
 */
export async function lookupUserByCode(userCode: string): Promise<string | null> {
  // First try the new userCodes collection
  const userCodeRef = doc(db, 'userCodes', userCode);
  const userCodeDoc = await getDoc(userCodeRef);

  if (userCodeDoc.exists()) {
    return userCodeDoc.data().uid;
  }

  // Fallback: query users collection (for users created before Phase 1.1)
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('userCode', '==', userCode));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].id;
}

/**
 * Get user profile for display (name, code).
 */
export async function getUserProfile(userId: string): Promise<{
  displayName: string | null;
  userCode: string | null;
} | null> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return null;
  }

  const data = userDoc.data();
  return {
    displayName: data.displayName ?? null,
    userCode: data.userCode ?? null,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Sync all library data to Firestore (for initial upload from guest).
 */
export async function syncAllLibraryData(
  userId: string,
  libraries: Record<LibraryId, Library>,
  userGames: Record<GameId, UserGame>,
  memberships: Record<LibraryId, LibraryMembership[]>,
  shelves?: Record<LibraryId, ShelfConfig | null>
): Promise<void> {
  const batch = writeBatch(db);

  // Sync all libraries
  for (const library of Object.values(libraries)) {
    const libraryRef = getLibraryDoc(userId, library.id);
    const payload = deepClean({
      ownerId: userId,
      name: library.name,
      description: library.description ?? null,
      visibility: library.visibility,
      systemKey: library.systemKey ?? null,
      sortOrder: library.sortOrder ?? 0,
      viewMode: library.viewMode ?? null,
      theme: library.theme ?? null,
      createdAt: library.createdAt,
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>;
    batch.set(libraryRef, payload, { merge: true });
  }

  // Sync all user games
  for (const userGame of Object.values(userGames)) {
    const gameRef = getUserGameDoc(userId, userGame.gameId);
    const payload = deepClean({
      gameId: userGame.gameId,
      ownerId: userId,
      gameName: userGame.gameName,
      gameThumbnail: userGame.gameThumbnail ?? null,
      gameYear: userGame.gameYear ?? null,
      status: userGame.status,
      myRating: userGame.myRating ?? null,
      favorite: userGame.favorite,
      notes: userGame.notes ?? null,
      tags: userGame.tags ?? null,
      forTrade: userGame.forTrade,
      forSale: userGame.forSale,
      boxSizeClass: userGame.boxSizeClass ?? null,
      boxWidthMm: userGame.boxWidthMm ?? null,
      boxHeightMm: userGame.boxHeightMm ?? null,
      boxDepthMm: userGame.boxDepthMm ?? null,
      condition: userGame.condition ?? null,
      language: userGame.language ?? null,
      edition: userGame.edition ?? null,
      playCount: userGame.playCount ?? null,
      winCount: userGame.winCount ?? null,
      focalPointX: userGame.focalPointX ?? null,
      focalPointY: userGame.focalPointY ?? null,
      createdAt: userGame.createdAt,
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>;
    batch.set(gameRef, payload, { merge: true });
  }

  // Sync all memberships
  for (const [libraryId, libraryMemberships] of Object.entries(memberships)) {
    for (const membership of libraryMemberships) {
      const membershipRef = getMembershipDoc(userId, libraryId, membership.gameId);
      const payload = deepClean({
        gameId: membership.gameId,
        addedAt: membership.addedAt,
        hideFromPublic: membership.hideFromPublic ?? null,
        gameName: membership.gameName ?? null,
        gameThumbnail: membership.gameThumbnail ?? null,
        gameYear: membership.gameYear ?? null,
      }) as Record<string, unknown>;
      batch.set(membershipRef, payload, { merge: true });
    }
  }

  // Sync all shelves (if provided)
  if (shelves) {
    for (const [libraryId, shelf] of Object.entries(shelves)) {
      if (shelf) {
        const shelfRef = getShelfDoc(userId, libraryId);
        const payload = deepClean({
          rowCount: shelf.rowCount,
          cells: shelf.cells.map((cell) => ({
            gameIds: cell.gameIds,
            orientation: cell.orientation ?? 'vertical',
          })),
          createdAt: shelf.createdAt,
          updatedAt: serverTimestamp(),
        }) as Record<string, unknown>;
        batch.set(shelfRef, payload, { merge: true });
      }
    }
  }

  await batch.commit();
}

/**
 * Get the count of games in a library.
 * Used for the 450 game cap check.
 */
export async function getLibraryGameCount(
  userId: string,
  libraryId: LibraryId
): Promise<number> {
  const membershipsCollection = getMembershipsCollection(userId, libraryId);
  const snapshot = await getDocs(membershipsCollection);
  return snapshot.size;
}

/**
 * Check which libraries contain a specific game.
 * Used for "Already in X libraries" badge.
 */
export async function getGameLibraries(
  userId: string,
  gameId: GameId,
  libraries: Record<LibraryId, Library>
): Promise<LibraryId[]> {
  const libraryIds: LibraryId[] = [];

  for (const libraryId of Object.keys(libraries)) {
    const membershipRef = getMembershipDoc(userId, libraryId, gameId);
    const membershipDoc = await getDoc(membershipRef);
    if (membershipDoc.exists()) {
      libraryIds.push(libraryId);
    }
  }

  return libraryIds;
}
