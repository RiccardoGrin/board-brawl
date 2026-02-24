import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { GameSession, Tournament, TournamentId, GameSessionId, GameSessionStatus } from '../types/tournament';

/**
 * Account tiers for feature access control.
 * - free: Default tier, basic features only
 * - premium: Paid tier with advanced features (future)
 * - admin: Full access to all features
 */
export type AccountTier = 'free' | 'premium' | 'admin';

/**
 * User profile stored in Firestore
 *
 * Note: displayName can come from two sources:
 * 1. User-set custom display name (set via updateUserDisplayName)
 * 2. Firebase Auth displayName (e.g., from Google sign-in)
 */
export interface UserProfile {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  userCode: string;
  /** Account tier for feature access (defaults to 'free') */
  accountTier?: AccountTier;
  /** Specific feature flags for granular access control */
  features?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * Generate a random 6-digit user code (100000-999999)
 */
export const generateUserCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Snapshot of tournaments and game sessions for syncing between local and remote state.
 */
type RemoteSnapshot = {
  tournaments: Record<TournamentId, Tournament>;
  gameSessions: Record<GameSessionId, GameSession>;
};

const tournamentsCollection = collection(db, 'tournaments');
const gameSessionsCollection = collection(db, 'gameSessions');

/**
 * Convert Firestore Timestamp or string to ISO string.
 */
const toIso = (value: unknown): string | undefined => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return undefined;
};

/**
 * Check if a value is a Firestore FieldValue (like serverTimestamp).
 */
const isFieldValue = (value: unknown) =>
  (value as { _methodName?: string })?._methodName === 'serverTimestamp' ||
  (value as { constructor?: { name?: string } })?.constructor?.name?.includes('FieldValue');

/**
 * Recursively clean an object by removing undefined values.
 * Preserves null, Timestamps, and FieldValues.
 */
export const deepClean = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isFieldValue(value) || value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value
      .map(deepClean)
      .filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, deepClean(v)])
        .filter(([, v]) => v !== undefined)
    );
  }
  return value;
};

/**
 * Write a tournament and its sessions to Firestore.
 * Ensures ownership/membership fields are set and timestamps are updated.
 * 
 * @param uid - The current user's ID
 * @param tournament - The tournament to sync
 * @param sessions - The game sessions belonging to this tournament
 */
export async function syncTournamentDocument(
  uid: string,
  tournament: Tournament,
  sessions: GameSession[],
): Promise<void> {
  // Ensure required fields have defaults
  const memberIds = tournament.memberIds?.length ? tournament.memberIds : [uid];
  const memberRoles = tournament.memberRoles ?? { [uid]: 'owner' as const };
  const ownerId = tournament.ownerId || uid;
  const gameSessions = tournament.gameSessions ?? [];
  const players = tournament.players ?? [];
  const state = tournament.state || 'active';
  const date = tournament.date || new Date().toISOString();
  // Preserve existing ownerName - it should already be set from the tournament store
  // which has access to the user's displayName/email
  const ownerName = tournament.ownerName;

  const tournamentRef = doc(tournamentsCollection, tournament.id);

  // Build the payload with explicit field order
  // IMPORTANT: Don't include description if it's undefined or empty string
  // IMPORTANT: Don't include 'id' field - it's the document ID, not a field
  const basePayload: Record<string, unknown> = {
    // Tournament fields (NOT including id)
    name: tournament.name,
    format: tournament.format,
    // Explicit required fields
    players,
    gameSessions,
    state,
    date,
    ownerId,
    memberIds,
    memberRoles,
    // Timestamps
    updatedAt: serverTimestamp(),
    createdAt: tournament.createdAt ? tournament.createdAt : serverTimestamp(),
  };
  
  // Only add description if it has a value
  if (tournament.description && tournament.description.trim().length > 0) {
    basePayload.description = tournament.description;
  }
  
  // Only add ownerName if it has a value
  if (ownerName) {
    basePayload.ownerName = ownerName;
  }
  
  // Only add bracket config if present
  if (tournament.bracketConfig) {
    basePayload.bracketConfig = tournament.bracketConfig;
  }

  const tournamentPayload = deepClean(basePayload);

  try {
    // Check if document already exists
    const docSnapshot = await getDoc(tournamentRef);
    const exists = docSnapshot.exists();

    // For new documents, don't use merge (triggers CREATE rules)
    // For existing documents, use merge (triggers UPDATE rules)
    if (exists) {
      await setDoc(tournamentRef, tournamentPayload as Record<string, unknown>, { merge: true });
    } else {
      await setDoc(tournamentRef, tournamentPayload as Record<string, unknown>);
    }
  } catch (error: unknown) {
    throw error;
  }

  // Validate session before sending to Firestore
  const validateSessionForFirestore = (session: GameSession, authUid: string): string[] => {
    const errors: string[] = [];

    // ownerId must match auth user
    const effectiveOwnerId = session.ownerId || authUid;
    if (!effectiveOwnerId || effectiveOwnerId !== authUid) {
      errors.push(`ownerId mismatch: effectiveOwnerId="${effectiveOwnerId}" vs authUid="${authUid}"`);
    }

    // gameName required
    if (!session.gameName || typeof session.gameName !== 'string' || session.gameName.length === 0) {
      errors.push(`gameName invalid: "${session.gameName}"`);
    }

    // preset required (non-empty string)
    if (!session.preset || typeof session.preset !== 'string' || session.preset.length === 0) {
      errors.push(`preset invalid: "${session.preset}"`);
    }

    // scoringRules required with numeric fields
    if (!session.scoringRules ||
        typeof session.scoringRules.first !== 'number' ||
        typeof session.scoringRules.second !== 'number' ||
        typeof session.scoringRules.third !== 'number' ||
        typeof session.scoringRules.others !== 'number') {
      errors.push(`scoringRules invalid: ${JSON.stringify(session.scoringRules)}`);
    }

    // participants required (non-empty array)
    if (!session.participants || !Array.isArray(session.participants) || session.participants.length === 0) {
      errors.push(`participants empty or invalid: length=${session.participants?.length}`);
    }

    // results required with mode and non-empty placements
    if (!session.results) {
      errors.push('results is missing');
    } else if (!session.results.mode || !['freeForAll', 'teams'].includes(session.results.mode)) {
      errors.push(`results.mode invalid: "${session.results.mode}"`);
    } else if (!session.results.placements || !Array.isArray(session.results.placements) || session.results.placements.length === 0) {
      errors.push(`results.placements empty or invalid: length=${session.results.placements?.length}`);
    }

    return errors;
  };

  // Write each game session to top-level collection (Phase 3)
  for (const session of sessions) {
    // Validate before attempting write
    const validationErrors = validateSessionForFirestore(session, uid);
    if (validationErrors.length > 0) {
      console.error('[syncTournamentDocument] Session validation failed:', {
        sessionId: session.id,
        tournamentId: tournament.id,
        errors: validationErrors,
        sessionData: {
          ownerId: session.ownerId,
          gameName: session.gameName,
          preset: session.preset,
          scoringRules: session.scoringRules,
          participantsCount: session.participants?.length,
          resultsMode: session.results?.mode,
          placementsCount: session.results?.placements?.length,
        },
      });
      // Skip this session but continue with others
      continue;
    }

    const sessionRef = doc(gameSessionsCollection, session.id);

    // Build Phase 3 session payload
    // Only include fields that are validated in Firestore rules
    // Let undefined values be filtered by deepClean so they don't exist in the doc
    const sessionPayload = deepClean({
      // Required fields (validated in rules)
      ownerId: session.ownerId || uid,
      gameName: session.gameName,
      preset: session.preset,
      scoringRules: session.scoringRules,
      participants: session.participants,
      results: session.results,
      status: session.status || 'complete',

      // Optional string fields - let undefined be filtered out
      tournamentId: session.tournamentId,
      bracketMatchId: session.bracketMatchId,
      gameId: session.gameId,
      gameThumbnail: session.gameThumbnail || session.gameMeta?.thumbnail,
      note: session.note,

      // Array fields (validated as optional lists)
      participantUserIds: session.participantUserIds || [],
      winnerUserIds: session.winnerUserIds || [],

      // Timestamps
      playedAt: session.playedAt || session.datePlayed || serverTimestamp(),
      createdAt: session.createdAt ? session.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await setDoc(sessionRef, sessionPayload as Record<string, unknown>, { merge: true });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      console.error('[syncTournamentDocument] Session write FAILED', {
        tournamentId: tournament.id,
        sessionId: session.id,
        errorCode: err?.code,
        errorMessage: err?.message,
        fullPayload: sessionPayload,
      });
      throw error;
    }
  }
}

/**
 * Delete a single game session and update the parent tournament's session list.
 * 
 * @param uid - The current user's ID
 * @param tournament - The parent tournament
 * @param sessionId - The ID of the session to delete
 * @param remainingSessions - The sessions that will remain after deletion
 */
export async function deleteGameSessionRemote(
  uid: string,
  tournament: Tournament,
  sessionId: GameSessionId,
  remainingSessions: GameSession[],
): Promise<void> {
  const memberIds = tournament.memberIds?.length ? tournament.memberIds : [uid];
  const memberRoles = tournament.memberRoles ?? { [uid]: 'owner' as const };
  const ownerId = tournament.ownerId || uid;
  const tournamentRef = doc(tournamentsCollection, tournament.id);

  const batch = writeBatch(db);

  // Delete from top-level collection (Phase 3)
  batch.delete(doc(gameSessionsCollection, sessionId));

  // Update tournament's session list
  batch.set(
    tournamentRef,
    deepClean({
      ownerId,
      memberIds,
      memberRoles,
      gameSessions: remainingSessions.map(s => s.id),
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>,
    { merge: true }
  );

  try {
    await batch.commit();
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[deleteGameSessionRemote] Session delete failed', {
      tournamentId: tournament.id,
      sessionId,
      errorCode: err?.code,
      errorMessage: err?.message,
    });
    throw error;
  }
}

/**
 * Delete a tournament and all of its game sessions.
 * 
 * @param uid - The current user's ID (must be the owner)
 * @param tournamentId - The ID of the tournament to delete
 */
export async function deleteTournamentRemote(_uid: string, tournamentId: TournamentId): Promise<void> {
  const tournamentRef = doc(tournamentsCollection, tournamentId);
  const sessionsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'gameSessions'));

  const batch = writeBatch(db);

  sessionsSnap.docs.forEach(sessionDoc => {
    batch.delete(sessionDoc.ref);
  });

  batch.delete(tournamentRef);

  try {
    await batch.commit();
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[deleteTournamentRemote] Tournament delete failed', {
      tournamentId,
      errorCode: err?.code,
      errorMessage: err?.message,
    });
    throw error;
  }
}

/**
 * Load all tournaments and game sessions for the current user from Firestore.
 * Only loads tournaments where the user is in the memberIds array.
 * 
 * @param uid - The current user's ID
 * @returns A snapshot containing all tournaments and game sessions
 */
export async function loadRemoteState(uid: string): Promise<RemoteSnapshot> {
  const tournaments: Record<TournamentId, Tournament> = {};
  const gameSessions: Record<GameSessionId, GameSession> = {};

  // First, fetch all tournaments
  const tournamentsQuery = query(tournamentsCollection, where('memberIds', 'array-contains', uid));
  const tournamentSnap = await getDocs(tournamentsQuery);

  // Parse tournament data
  for (const docSnap of tournamentSnap.docs) {
    const data = docSnap.data();
    const tournamentId = docSnap.id as TournamentId;

    const tournament: Tournament = {
      id: tournamentId,
      name: data.name,
      description: data.description,
      date: data.date,
      state: data.state,
      players: data.players || [],
      gameSessions: data.gameSessions || [],
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      memberIds: data.memberIds,
      memberRoles: data.memberRoles,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
      format: data.format,
      bracketConfig: data.bracketConfig,
    };

    tournaments[tournamentId] = tournament;
  }

  // Fetch game sessions from top-level collection (Phase 3)
  // Query sessions where user is owner OR a participant
  try {
    // First, get sessions owned by the user
    const ownedSessionsQuery = query(gameSessionsCollection, where('ownerId', '==', uid));
    const ownedSessionsSnap = await getDocs(ownedSessionsQuery);

    // Also get sessions where user is a participant (for shared tournaments)
    const participantSessionsQuery = query(
      gameSessionsCollection,
      where('participantUserIds', 'array-contains', uid)
    );
    const participantSessionsSnap = await getDocs(participantSessionsQuery);

    // Combine and dedupe sessions
    const allSessionDocs = new Map<string, typeof ownedSessionsSnap.docs[0]>();
    for (const doc of ownedSessionsSnap.docs) {
      allSessionDocs.set(doc.id, doc);
    }
    for (const doc of participantSessionsSnap.docs) {
      if (!allSessionDocs.has(doc.id)) {
        allSessionDocs.set(doc.id, doc);
      }
    }

    // Process all game sessions
    for (const sessionDoc of allSessionDocs.values()) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id as GameSessionId;

      // Build the session with Phase 3 schema
      const session: GameSession = {
        id: sessionId,
        ownerId: sessionData.ownerId,
        createdAt: toIso(sessionData.createdAt) || '',
        updatedAt: toIso(sessionData.updatedAt) || '',
        playedAt: sessionData.playedAt || toIso(sessionData.datePlayed) || '',

        // Game info
        gameId: sessionData.gameId,
        gameName: sessionData.gameName,
        gameThumbnail: sessionData.gameThumbnail || sessionData.gameMeta?.thumbnail,
        gameSourceIds: sessionData.gameSourceIds,
        gameMeta: sessionData.gameMeta,

        // Linking
        tournamentId: sessionData.tournamentId,
        bracketMatchId: sessionData.bracketMatchId,

        // Lifecycle
        status: (sessionData.status as GameSessionStatus) || 'complete',

        // Scoring
        preset: sessionData.preset,
        scoringRules: sessionData.scoringRules,

        // Participant tracking
        participantUserIds: sessionData.participantUserIds || [],
        winnerUserIds: sessionData.winnerUserIds || [],

        // Participants
        participants: sessionData.participants || [],
        teams: sessionData.teams,

        // Results
        results: sessionData.results,

        // Optional enrichment
        note: sessionData.note,
        media: sessionData.media,

        // Legacy compatibility
        datePlayed: sessionData.datePlayed,
        gameType: sessionData.gameType,
      };

      gameSessions[sessionId] = session;
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[loadRemoteState] Failed to read gameSessions', {
      errorCode: err?.code,
      errorMessage: err?.message,
    });
    throw error;
  }

  return { tournaments, gameSessions };
}

/**
 * Sync local tournaments and sessions to Firestore.
 * Used during initial sign-in to push local-only data to the cloud.
 * 
 * @param uid - The current user's ID
 * @param snapshot - The local snapshot to sync
 */
export async function syncLocalToRemote(
  uid: string,
  snapshot: RemoteSnapshot,
): Promise<void> {
  const entries = Object.values(snapshot.tournaments);

  for (const tournament of entries) {
    const memberIds = tournament.memberIds?.length ? tournament.memberIds : [uid];
    const memberRoles = tournament.memberRoles ?? { [uid]: 'owner' as const };
    const ownerId = tournament.ownerId || uid;
    const gameSessions = tournament.gameSessions ?? [];
    const players = tournament.players ?? [];
    const state = tournament.state || 'active';
    const date = tournament.date || new Date().toISOString();

    const tournamentRef = doc(tournamentsCollection, tournament.id);
    
    // Build the payload with explicit field order
    // IMPORTANT: Don't include description if it's undefined or empty string
    // IMPORTANT: Don't include 'id' field - it's the document ID, not a field
    const basePayload: Record<string, unknown> = {
      name: tournament.name,
      format: tournament.format,
      // Explicit required fields
      players,
      gameSessions,
      state,
      date,
      ownerId,
      memberIds,
      memberRoles,
      // Timestamps
      updatedAt: serverTimestamp(),
      createdAt: tournament.createdAt ? tournament.createdAt : serverTimestamp(),
    };
    
    // Only add description if it has a value
    if (tournament.description && tournament.description.trim().length > 0) {
      basePayload.description = tournament.description;
    }
    
    // Only add ownerName if it has a value
    if (tournament.ownerName) {
      basePayload.ownerName = tournament.ownerName;
    }
    
    // Only add bracket config if present
    if (tournament.bracketConfig) {
      basePayload.bracketConfig = tournament.bracketConfig;
    }
    
    const tournamentPayload = deepClean(basePayload);

    try {
      await setDoc(
        tournamentRef,
        tournamentPayload as Record<string, unknown>,
        { merge: true }
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      console.error('[syncLocalToRemote] Tournament write failed', {
        tournamentId: tournament.id,
        errorCode: err?.code,
        errorMessage: err?.message,
      });
      throw error;
    }

    const sessionIds: GameSessionId[] = [];
    for (const sessionId of tournament.gameSessions) {
      const session = snapshot.gameSessions[sessionId];
      if (!session) continue;

      // Write to top-level collection (Phase 3)
      const sessionRef = doc(gameSessionsCollection, session.id);

      // Build payload matching Firestore rules validation
      const sessionPayload = deepClean({
        // Required fields
        ownerId: session.ownerId || uid,
        gameName: session.gameName,
        preset: session.preset,
        scoringRules: session.scoringRules,
        participants: session.participants,
        results: session.results,
        status: session.status || 'complete',

        // Optional fields - let undefined be filtered out
        tournamentId: session.tournamentId,
        bracketMatchId: session.bracketMatchId,
        gameId: session.gameId,
        gameThumbnail: session.gameThumbnail || session.gameMeta?.thumbnail,
        note: session.note,

        // Array fields
        participantUserIds: session.participantUserIds || [],
        winnerUserIds: session.winnerUserIds || [],

        // Timestamps
        playedAt: session.playedAt || session.datePlayed || serverTimestamp(),
        createdAt: session.createdAt ? session.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await setDoc(
          sessionRef,
          sessionPayload as Record<string, unknown>,
          { merge: true }
        );
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        console.error('[syncLocalToRemote] Session write failed', {
          tournamentId: tournament.id,
          sessionId,
          errorCode: err?.code,
          errorMessage: err?.message,
          payload: sessionPayload,
        });
        throw error;
      }
      sessionIds.push(session.id);
    }

    // Ensure the tournament's gameSessions field is in sync
    try {
      await setDoc(
        tournamentRef,
        { gameSessions: sessionIds, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      console.error('[syncLocalToRemote] SessionIds update failed', {
        tournamentId: tournament.id,
        errorCode: err?.code,
        errorMessage: err?.message,
      });
      throw error;
    }
  }
}

/**
 * Create or update a user profile document.
 * Generates a unique 6-digit userCode on first creation.
 * Uses retry logic in case of code collision (very rare with 900k possibilities).
 * 
 * IMPORTANT: Does NOT overwrite custom displayName. Only sets displayName from
 * Firebase Auth if the user doesn't have a custom displayName set yet.
 * 
 * @param uid - The user's ID
 * @param profile - The profile data to upsert
 * @returns The user's profile including their userCode
 */
export async function upsertUserProfile(
  uid: string,
  profile: { displayName?: string | null; photoURL?: string | null; email?: string | null }
): Promise<UserProfile> {
  const profileRef = doc(collection(db, 'users'), uid);
  
  // Check if user already exists with a userCode
  const existingDoc = await getDoc(profileRef);
  const existingData = existingDoc.data();
  
  if (existingData?.userCode) {
    // User already has a code
    // IMPORTANT: Preserve existing custom displayName, only update photo/email
    // Don't overwrite custom displayName with Firebase Auth displayName
    const updates: Record<string, unknown> = {
      photoURL: profile.photoURL ?? null,
      email: profile.email ?? null,
      updatedAt: serverTimestamp(),
    };
    
    // Only update displayName if user doesn't have one set yet
    // This prevents Firebase Auth displayName from overwriting custom displayName
    if (!existingData.displayName && profile.displayName) {
      updates.displayName = profile.displayName;
    }
    
    await setDoc(profileRef, updates, { merge: true });
    
    return {
      uid,
      displayName: existingData.displayName ?? profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      userCode: existingData.userCode,
      accountTier: existingData.accountTier,
      features: existingData.features,
    };
  }
  
  // New user - generate a unique code with retry logic
  const MAX_RETRIES = 5;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userCode = generateUserCode();
    
    try {
      // Check if this code is already in use by querying the users collection
      const codeQuery = query(collection(db, 'users'), where('userCode', '==', userCode));
      const codeSnapshot = await getDocs(codeQuery);
      
      if (!codeSnapshot.empty) {
        // Code collision - try again
        console.debug('[upsertUserProfile] Code collision, retrying', { userCode, attempt });
        continue;
      }
      
      // Code is unique, create the user profile
      await setDoc(
        profileRef,
        {
          uid,
          displayName: profile.displayName ?? null,
          photoURL: profile.photoURL ?? null,
          email: profile.email ?? null,
          userCode,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      
      return {
        uid,
        displayName: profile.displayName,
        email: profile.email,
        photoURL: profile.photoURL,
        userCode,
      };
    } catch (error) {
      lastError = error as Error;
      console.error('[upsertUserProfile] Failed attempt', { attempt, error });
    }
  }
  
  throw lastError || new Error('Failed to generate unique user code after max retries');
}

/**
 * Look up a user by their 6-digit code.
 * Uses /userCodes collection for fast single-document lookup.
 * Falls back to /users query for backwards compatibility.
 * 
 * @param userCode - The 6-digit user code to look up
 * @returns The user profile if found, null otherwise
 */
export async function lookupUserByCode(userCode: string): Promise<UserProfile | null> {
  // Validate code format (6 digits)
  if (!/^\d{6}$/.test(userCode)) {
    return null;
  }
  
  // Try the fast path: /userCodes/{code} → uid mapping (created by Cloud Function)
  try {
    const codeRef = doc(collection(db, 'userCodes'), userCode);
    const codeSnap = await getDoc(codeRef);
    
    if (codeSnap.exists()) {
      const { uid } = codeSnap.data();
      
      // Fetch the full user profile
      const userRef = doc(collection(db, 'users'), uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        return {
          uid,
          displayName: data.displayName,
          email: data.email,
          photoURL: data.photoURL,
          userCode: data.userCode,
          accountTier: data.accountTier,
          features: data.features,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      }
    }
  } catch (error) {
    console.debug('[lookupUserByCode] Fast path failed, falling back to query', error);
  }
  
  // Fallback: Query /users collection (for older users or if Cloud Function hasn't run yet)
  const codeQuery = query(collection(db, 'users'), where('userCode', '==', userCode));
  const snapshot = await getDocs(codeQuery);
  
  if (snapshot.empty) {
    return null;
  }
  
  const userData = snapshot.docs[0].data();
  return {
    uid: snapshot.docs[0].id,
    displayName: userData.displayName,
    email: userData.email,
    photoURL: userData.photoURL,
    userCode: userData.userCode,
    accountTier: userData.accountTier,
    features: userData.features,
  };
}

/**
 * Update a user's custom display name.
 * This is separate from the Firebase Auth displayName and takes precedence.
 * Also updates the player name in all tournaments where this user is linked.
 * 
 * @param uid - The user's ID
 * @param displayName - The custom display name (1-25 characters)
 * @returns The updated user profile
 * @throws Error if displayName is invalid or update fails
 */
export async function updateUserDisplayName(
  uid: string,
  displayName: string
): Promise<UserProfile> {
  // Validate display name
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 25) {
    throw new Error('Display name must be between 1 and 25 characters');
  }
  
  const profileRef = doc(collection(db, 'users'), uid);
  
  // Update the displayName field
  await setDoc(
    profileRef,
    {
      displayName: trimmed,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  
  // Update player names in all tournaments where this user is linked
  await updatePlayerNamesInTournaments(uid, trimmed);
  
  // Fetch and return the updated profile
  const snapshot = await getDoc(profileRef);
  if (!snapshot.exists()) {
    throw new Error('User profile not found');
  }
  
  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName,
    email: data.email,
    photoURL: data.photoURL,
    userCode: data.userCode,
  };
}

/**
 * Update player names in all tournaments where a user is linked.
 * This ensures that when a user changes their display name, it propagates
 * to all tournaments where they are a player.
 * 
 * @param uid - The user's ID
 * @param newDisplayName - The new display name to set
 */
async function updatePlayerNamesInTournaments(
  uid: string,
  newDisplayName: string
): Promise<void> {
  try {
    // Find all tournaments where this user is a member
    const q = query(tournamentsCollection, where('memberIds', 'array-contains', uid));
    const tournamentSnap = await getDocs(q);
    
    const batch = writeBatch(db);
    let updateCount = 0;
    
    for (const docSnap of tournamentSnap.docs) {
      const data = docSnap.data();
      const players = data.players || [];
      
      // Find players with this userId and update their names
      const updatedPlayers = players.map((player: any) => {
        if (player.userId === uid) {
          return { ...player, name: newDisplayName };
        }
        return player;
      });
      
      // Only update if there were changes
      const hasChanges = players.some((player: any, index: number) => 
        player.userId === uid && player.name !== updatedPlayers[index].name
      );
      
      if (hasChanges) {
        batch.set(
          docSnap.ref,
          {
            players: updatedPlayers,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        updateCount++;
      }
    }
    
    if (updateCount > 0) {
      await batch.commit();
      console.debug(`[updatePlayerNamesInTournaments] Updated ${updateCount} tournaments`);
    }
  } catch (error) {
    console.error('[updatePlayerNamesInTournaments] Failed to update player names:', error);
    // Don't throw - we don't want to block the display name update if this fails
  }
}

/**
 * Get the current user's profile including their userCode.
 *
 * @param uid - The user's ID
 * @returns The user profile if found, null otherwise
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const profileRef = doc(collection(db, 'users'), uid);
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName,
    email: data.email,
    photoURL: data.photoURL,
    userCode: data.userCode,
    accountTier: data.accountTier,
    features: data.features,
  };
}
