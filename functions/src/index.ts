import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {defineSecret} from "firebase-functions/params";
import {XMLParser} from "fast-xml-parser";
import * as admin from "firebase-admin";
import {
  onDocumentCreated,
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";

// Gemini Vision for AI Photo Import
export {processShelfPhoto} from "./geminiVision";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({maxInstances: 10});

// ============================================================================
// User Initialization - Creates profile and system libraries on signup
// ============================================================================

/**
 * Generate a unique 6-digit user code.
 * Codes are in range 100000-999999 (900k possible values).
 * Uses retry logic to handle rare collisions.
 */
async function generateUniqueUserCode(): Promise<string> {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Generate random 6-digit code (100000-999999)
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Check if code already exists
    const existing = await db.collection("userCodes").doc(code).get();
    if (!existing.exists) {
      return code;
    }
  }

  throw new Error("Failed to generate unique user code after max attempts");
}

/**
 * Firestore trigger - runs when a user document is created.
 * This is triggered client-side by the auth sync hook after sign-up.
 * Creates:
 * - /userCodes/{code} - Public mapping for userCode -> uid
 * - /users/{uid}/libraries/{myId} - "My Library" (system library)
 * - /users/{uid}/libraries/{wishlistId} - "Wishlist" (system library)
 * 
 * Note: The client creates the initial /users/{uid} document with userCode.
 * This function just handles the dependent resources (userCode mapping + system libraries).
 */
export const onUserCreated = onDocumentCreated("users/{uid}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.error("[initializeUserProfile] No snapshot data");
    return;
  }

  const uid = event.params.uid;
  const userData = snapshot.data();
  
  if (!userData) {
    console.error("[initializeUserProfile] No user data in document");
    return;
  }

  const userCode = userData.userCode;
  if (!userCode) {
    console.error("[initializeUserProfile] No userCode in user document");
    return;
  }

  const now = new Date().toISOString();

  console.log(`[onUserCreated] Creating profile for user: ${uid}`, {userCode});

  try {
    // Create userCode mapping document (for public lookups)
    const userCodeMapping = {
      uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // System library IDs
    const myLibraryId = `my-${uid.slice(0, 8)}`;
    const wishlistId = `wishlist-${uid.slice(0, 8)}`;

    // My Library document
    const myLibrary = {
      ownerId: uid,
      name: "My Library",
      visibility: "public",
      systemKey: "my",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Wishlist document
    const wishlistLibrary = {
      ownerId: uid,
      name: "Wishlist",
      visibility: "private",
      systemKey: "wishlist",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Execute all writes in a batch for atomicity
    const batch = db.batch();

    batch.set(db.collection("userCodes").doc(userCode), userCodeMapping);
    batch.set(
      db.collection("users").doc(uid).collection("libraries").doc(myLibraryId),
      myLibrary
    );
    batch.set(
      db.collection("users").doc(uid).collection("libraries").doc(wishlistId),
      wishlistLibrary
    );

    await batch.commit();

    console.log(`[onUserCreated] Successfully created profile for ${uid}`, {
      userCode,
      myLibraryId,
      wishlistId,
    });
  } catch (error) {
    console.error(`[onUserCreated] Failed for user ${uid}:`, error);
    // Don't throw - the client can retry or handle gracefully
  }
});

// ============================================================================
// Stats Aggregation - Maintains precomputed user statistics
// ============================================================================

/**
 * Helper to safely get array difference (items in arr1 but not in arr2)
 */
function arrayDiff(arr1: string[], arr2: string[]): string[] {
  const set2 = new Set(arr2);
  return arr1.filter((item) => !set2.has(item));
}

/**
 * Helper to safely get array union (unique items from both arrays)
 */
function arrayUnion(arr1: string[], arr2: string[]): string[] {
  return [...new Set([...arr1, ...arr2])];
}

/**
 * Update the most played game for a user by querying their gameStats
 */
async function updateMostPlayedGame(uid: string): Promise<void> {
  try {
    const gameStatsRef = db.collection("users").doc(uid).collection("gameStats");
    const topGame = await gameStatsRef
      .orderBy("playCount", "desc")
      .limit(1)
      .get();

    const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");

    if (topGame.empty) {
      // No games played, clear most played
      await statsRef.set({
        mostPlayedGameId: admin.firestore.FieldValue.delete(),
        mostPlayedGameName: admin.firestore.FieldValue.delete(),
        mostPlayedGameThumbnail: admin.firestore.FieldValue.delete(),
        mostPlayedGameCount: admin.firestore.FieldValue.delete(),
        lastUpdated: new Date().toISOString(),
      }, {merge: true});
    } else {
      const topGameData = topGame.docs[0].data();
      await statsRef.set({
        mostPlayedGameId: topGameData.gameId,
        mostPlayedGameName: topGameData.gameName,
        mostPlayedGameThumbnail: topGameData.gameThumbnail || null,
        mostPlayedGameCount: topGameData.playCount,
        lastUpdated: new Date().toISOString(),
      }, {merge: true});
    }
  } catch (error) {
    console.error(`[updateMostPlayedGame] Failed for user ${uid}:`, error);
  }
}

/**
 * Firestore trigger - runs when a game session document is created, updated, or deleted.
 * Updates user stats for all affected participants.
 *
 * Stats updated:
 * - gamesPlayed: +1 when session becomes complete, -1 when deleted/uncompleted
 * - gamesWon: +1/-1 based on winnerUserIds changes
 * - Per-game stats (playCount, winCount) in /users/{uid}/gameStats/{gameId}
 * - UserGame.playCount/winCount synced for games in user's library
 * - unplayedGames adjusted when owned games transition to/from played
 */
export const onGameSessionWrite = onDocumentWritten(
  "gameSessions/{sessionId}",
  async (event) => {
    const sessionId = event.params.sessionId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Determine event type
    const isCreate = !beforeData && !!afterData;
    const isDelete = !!beforeData && !afterData;
    const isUpdate = !!beforeData && !!afterData;

    console.log(`[onGameSessionWrite] Processing ${sessionId}`, {
      isCreate,
      isUpdate,
      isDelete,
    });

    // Extract participant and winner arrays (safely handle missing fields)
    const beforeParticipants: string[] = beforeData?.participantUserIds || [];
    const afterParticipants: string[] = afterData?.participantUserIds || [];
    const beforeWinners: string[] = beforeData?.winnerUserIds || [];
    const afterWinners: string[] = afterData?.winnerUserIds || [];
    const beforeStatus = beforeData?.status;
    const afterStatus = afterData?.status;
    const beforeComplete = beforeStatus === "complete";
    const afterComplete = afterStatus === "complete";

    // Game info for per-game stats
    const gameId = afterData?.gameId || beforeData?.gameId;
    const gameName = afterData?.gameName || beforeData?.gameName;
    const gameThumbnail = afterData?.gameThumbnail || beforeData?.gameThumbnail;
    const playedAt = afterData?.playedAt || beforeData?.playedAt || new Date().toISOString();

    // Get all affected users (union of before and after participants)
    const allAffectedUsers = arrayUnion(beforeParticipants, afterParticipants);

    if (allAffectedUsers.length === 0) {
      console.log(`[onGameSessionWrite] No users affected for session ${sessionId}`);
      return;
    }

    // Pre-calculate deltas for each user to determine which UserGames to fetch
    const userDeltas: Map<string, { gamesPlayedDelta: number; gamesWonDelta: number }> = new Map();

    for (const uid of allAffectedUsers) {
      const wasParticipant = beforeParticipants.includes(uid);
      const isParticipant = afterParticipants.includes(uid);
      const wasWinner = beforeWinners.includes(uid);
      const isWinner = afterWinners.includes(uid);

      // Calculate gamesPlayed delta
      let gamesPlayedDelta = 0;
      if (isParticipant && afterComplete && (!wasParticipant || !beforeComplete)) {
        gamesPlayedDelta = 1;
      } else if (wasParticipant && beforeComplete && (!isParticipant || !afterComplete)) {
        gamesPlayedDelta = -1;
      }

      // Calculate gamesWon delta
      let gamesWonDelta = 0;
      if (isWinner && afterComplete && (!wasWinner || !beforeComplete)) {
        gamesWonDelta = 1;
      } else if (wasWinner && beforeComplete && (!isWinner || !afterComplete)) {
        gamesWonDelta = -1;
      }

      if (gamesPlayedDelta !== 0 || gamesWonDelta !== 0) {
        userDeltas.set(uid, {gamesPlayedDelta, gamesWonDelta});
      }
    }

    // Pre-fetch UserGame documents for users with changes (if gameId exists)
    // This allows us to check current playCount for unplayedGames adjustments
    const userGameDocs: Map<string, admin.firestore.DocumentSnapshot> = new Map();
    if (gameId) {
      const fetchPromises: Promise<void>[] = [];
      for (const uid of userDeltas.keys()) {
        fetchPromises.push(
          db.collection("users").doc(uid).collection("games").doc(gameId).get()
            .then((doc) => {
              userGameDocs.set(uid, doc);
            })
        );
      }
      await Promise.all(fetchPromises);
    }

    const batch = db.batch();
    const usersNeedingMostPlayedUpdate: string[] = [];

    for (const uid of allAffectedUsers) {
      const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");
      const deltas = userDeltas.get(uid);

      if (!deltas) continue;

      const {gamesPlayedDelta, gamesWonDelta} = deltas;

      // Update aggregate stats
      const updates: Record<string, unknown> = {
        lastUpdated: new Date().toISOString(),
      };
      if (gamesPlayedDelta !== 0) {
        updates.gamesPlayed = admin.firestore.FieldValue.increment(gamesPlayedDelta);
      }
      if (gamesWonDelta !== 0) {
        updates.gamesWon = admin.firestore.FieldValue.increment(gamesWonDelta);
      }
      batch.set(statsRef, updates, {merge: true});

      // Update per-game stats if we have a gameId
      if (gameId) {
        const gameStatsRef = db.collection("users").doc(uid).collection("gameStats").doc(gameId);

        const gameStatsUpdates: Record<string, unknown> = {
          gameId,
          gameName: gameName || "Unknown Game",
          gameThumbnail: gameThumbnail || null,
        };

        if (gamesPlayedDelta !== 0) {
          gameStatsUpdates.playCount = admin.firestore.FieldValue.increment(gamesPlayedDelta);
          if (gamesPlayedDelta > 0) {
            gameStatsUpdates.lastPlayed = playedAt;
          }
        }
        if (gamesWonDelta !== 0) {
          gameStatsUpdates.winCount = admin.firestore.FieldValue.increment(gamesWonDelta);
        }

        batch.set(gameStatsRef, gameStatsUpdates, {merge: true});
        usersNeedingMostPlayedUpdate.push(uid);

        // Sync UserGame in library if it exists
        const userGameDoc = userGameDocs.get(uid);
        if (userGameDoc?.exists) {
          const userGameRef = db.collection("users").doc(uid).collection("games").doc(gameId);
          const userGameData = userGameDoc.data();
          const currentPlayCount = userGameData?.playCount || 0;

          const userGameUpdates: Record<string, unknown> = {
            updatedAt: new Date().toISOString(),
          };

          if (gamesPlayedDelta !== 0) {
            userGameUpdates.playCount = admin.firestore.FieldValue.increment(gamesPlayedDelta);
          }
          if (gamesWonDelta !== 0) {
            userGameUpdates.winCount = admin.firestore.FieldValue.increment(gamesWonDelta);
          }

          batch.update(userGameRef, userGameUpdates);

          // Adjust unplayedGames stat based on playCount transitions
          // Only if the game is owned (status === 'owned' and in My Library)
          const gameStatus = userGameData?.status;
          if (gameStatus === "owned") {
            if (currentPlayCount === 0 && gamesPlayedDelta > 0) {
              // Game transitioning from unplayed to played - decrement unplayedGames
              batch.set(statsRef, {
                unplayedGames: admin.firestore.FieldValue.increment(-1),
              }, {merge: true});
              console.log(`[onGameSessionWrite] Decrementing unplayedGames for user ${uid}, game ${gameId}`);
            } else if (currentPlayCount + gamesPlayedDelta <= 0 && currentPlayCount > 0) {
              // Game transitioning from played to unplayed - increment unplayedGames
              batch.set(statsRef, {
                unplayedGames: admin.firestore.FieldValue.increment(1),
              }, {merge: true});
              console.log(`[onGameSessionWrite] Incrementing unplayedGames for user ${uid}, game ${gameId}`);
            }
          }
        }
      }
    }

    try {
      await batch.commit();
      console.log(`[onGameSessionWrite] Updated stats for ${allAffectedUsers.length} users`);

      // Update most played game for affected users (after batch commit)
      for (const uid of [...new Set(usersNeedingMostPlayedUpdate)]) {
        await updateMostPlayedGame(uid);
      }
    } catch (error) {
      console.error(`[onGameSessionWrite] Failed for session ${sessionId}:`, error);
    }
  }
);

/**
 * Firestore trigger - runs when a tournament document is created, updated, or deleted.
 * Updates tournamentsPlayed count for users added/removed from memberIds.
 */
export const onTournamentWrite = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const tournamentId = event.params.tournamentId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Extract memberIds arrays (safely handle missing fields)
    const beforeMembers: string[] = beforeData?.memberIds || [];
    const afterMembers: string[] = afterData?.memberIds || [];

    // Find users added and removed
    const addedMembers = arrayDiff(afterMembers, beforeMembers);
    const removedMembers = arrayDiff(beforeMembers, afterMembers);

    if (addedMembers.length === 0 && removedMembers.length === 0) {
      // No membership changes
      return;
    }

    console.log(`[onTournamentWrite] Processing ${tournamentId}`, {
      added: addedMembers.length,
      removed: removedMembers.length,
    });

    const batch = db.batch();

    // Increment tournamentsPlayed for added members
    for (const uid of addedMembers) {
      const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");
      batch.set(statsRef, {
        tournamentsPlayed: admin.firestore.FieldValue.increment(1),
        lastUpdated: new Date().toISOString(),
      }, {merge: true});
    }

    // Decrement tournamentsPlayed for removed members
    for (const uid of removedMembers) {
      const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");
      batch.set(statsRef, {
        tournamentsPlayed: admin.firestore.FieldValue.increment(-1),
        lastUpdated: new Date().toISOString(),
      }, {merge: true});
    }

    try {
      await batch.commit();
      console.log(`[onTournamentWrite] Updated stats for tournament ${tournamentId}`);
    } catch (error) {
      console.error(`[onTournamentWrite] Failed for tournament ${tournamentId}:`, error);
    }
  }
);

/**
 * Firestore trigger - runs when a UserGame document is created.
 * Updates gamesOwned count if the game is added to "My Library".
 * Also syncs any existing play history from gameStats to the UserGame.
 */
export const onUserGameCreated = onDocumentCreated(
  "users/{uid}/games/{gameId}",
  async (event) => {
    const uid = event.params.uid;
    const gameId = event.params.gameId;

    console.log(`[onUserGameCreated] Processing game ${gameId} for user ${uid}`);

    try {
      // Check if this game is in "My Library" (has systemKey: 'my')
      const librariesRef = db.collection("users").doc(uid).collection("libraries");
      const myLibraryQuery = await librariesRef.where("systemKey", "==", "my").limit(1).get();

      if (myLibraryQuery.empty) {
        console.log(`[onUserGameCreated] No My Library found for user ${uid}`);
        return;
      }

      const myLibraryId = myLibraryQuery.docs[0].id;

      // Check if this game has a membership in My Library
      const membershipRef = librariesRef
        .doc(myLibraryId)
        .collection("items")
        .doc(gameId);
      const membershipDoc = await membershipRef.get();

      if (!membershipDoc.exists) {
        // Game is not in My Library, don't count as owned
        console.log(`[onUserGameCreated] Game ${gameId} not in My Library`);
        return;
      }

      // Get the UserGame data
      const gameData = event.data?.data();
      let playCount = gameData?.playCount || 0;
      let winCount = gameData?.winCount || 0;

      // Check for existing play history in gameStats (from games played before adding to library)
      const gameStatsRef = db.collection("users").doc(uid).collection("gameStats").doc(gameId);
      const gameStatsDoc = await gameStatsRef.get();

      if (gameStatsDoc.exists) {
        const gameStatsData = gameStatsDoc.data();
        const existingPlayCount = gameStatsData?.playCount || 0;
        const existingWinCount = gameStatsData?.winCount || 0;

        if (existingPlayCount > playCount || existingWinCount > winCount) {
          // Sync existing play history to the UserGame document
          const userGameRef = db.collection("users").doc(uid).collection("games").doc(gameId);
          await userGameRef.update({
            playCount: existingPlayCount,
            winCount: existingWinCount,
            updatedAt: new Date().toISOString(),
          });
          console.log(`[onUserGameCreated] Synced existing play history to UserGame: ${existingPlayCount} plays, ${existingWinCount} wins`);

          // Use the existing play count for unplayedGames calculation
          playCount = existingPlayCount;
        }
      }

      // Update stats
      const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");
      const updates: Record<string, unknown> = {
        gamesOwned: admin.firestore.FieldValue.increment(1),
        lastUpdated: new Date().toISOString(),
      };

      // If unplayed (checking both UserGame and gameStats), increment unplayedGames
      if (playCount === 0) {
        updates.unplayedGames = admin.firestore.FieldValue.increment(1);
      }

      await statsRef.set(updates, {merge: true});
      console.log(`[onUserGameCreated] Updated owned stats for user ${uid}, playCount: ${playCount}`);
    } catch (error) {
      console.error(`[onUserGameCreated] Failed for user ${uid}, game ${gameId}:`, error);
    }
  }
);

/**
 * Firestore trigger - runs when a UserGame document is deleted.
 * Updates gamesOwned count if the game was in "My Library".
 */
export const onUserGameDeleted = onDocumentDeleted(
  "users/{uid}/games/{gameId}",
  async (event) => {
    const uid = event.params.uid;
    const gameId = event.params.gameId;
    const deletedData = event.data?.data();

    console.log(`[onUserGameDeleted] Processing game ${gameId} for user ${uid}`);

    try {
      // We need to check if this game WAS in My Library
      // Since the membership might also be deleted, we check the deleted UserGame's status
      // If status was 'owned', we assume it was in My Library
      const wasOwned = deletedData?.status === "owned";

      if (!wasOwned) {
        console.log(`[onUserGameDeleted] Game ${gameId} was not owned`);
        return;
      }

      const playCount = deletedData?.playCount || 0;

      // Update stats
      const statsRef = db.collection("users").doc(uid).collection("stats").doc("aggregate");
      const updates: Record<string, unknown> = {
        gamesOwned: admin.firestore.FieldValue.increment(-1),
        lastUpdated: new Date().toISOString(),
      };

      // If was unplayed, decrement unplayedGames
      if (playCount === 0) {
        updates.unplayedGames = admin.firestore.FieldValue.increment(-1);
      }

      await statsRef.set(updates, {merge: true});
      console.log(`[onUserGameDeleted] Updated owned stats for user ${uid}`);
    } catch (error) {
      console.error(`[onUserGameDeleted] Failed for user ${uid}, game ${gameId}:`, error);
    }
  }
);

// ============================================================================
// BGG API Functions
// ============================================================================

// Define the BGG API token as a secret
const bggApiToken = defineSecret("BGG_API_TOKEN");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  htmlEntities: true,
});

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;
// Honor BGG guidance (~5s between hits) https://boardgamegeek.com/using_the_xml_api
const RATE_MS = 5500;
let lastHit = 0;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ??
  "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowCors = (req: any, res: any) => {
  const origin = req.headers.origin;
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  res.set("Access-Control-Allow-Origin", isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
};

const normalizeName = (s: string) => s.trim().toLowerCase();

const toArray = <T>(v: T | T[] | undefined): T[] => {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
};

type BggRank = {
  id: string;
  name: string;
  value: string;
  bayes?: string;
};

type BggResult = {
  primaryName: string;
  altNames: string[];
  sourceIds: {bgg: string};
  year?: number;
  minPlayers?: number;
  maxPlayers?: number;
  minPlaytime?: number;
  maxPlaytime?: number;
  playingTime?: number;
  designers: string[];
  publishers: string[];
  categories: string[];
  mechanics: string[];
  image?: string;
  thumbnail?: string;
  additionalImages?: string[];
  rulesFiles?: Array<{id: string; name: string}>;
  boxWidthInches?: number;
  boxLengthInches?: number;
  boxDepthInches?: number;
  boxWeightLbs?: number;
  rating?: number;
  bayesAverage?: number;
  ranks: BggRank[];
  fetchedAt: string;
  sources: string[];
  normalized?: string;
};

const fetchWithRetry = async (url: string, headers: Record<string, string>, attempts = 2, delayMs = 1200) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, {headers});
      if (!resp.ok) {
        lastError = new Error(`status ${resp.status}`);
        if ([401, 429, 500, 502, 503].includes(resp.status) && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
          continue;
        }
        return resp;
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
    }
  }
  throw lastError;
};

const parseThing = (thing: any): BggResult => {
  const names = toArray(thing.name);
  const primary = names.find((n: any) => n.type === "primary");
  const alts = names.filter((n: any) => n.type !== "primary");

  const links = toArray(thing.link);
  const getLinkValues = (type: string) =>
    links.filter((l: any) => l.type === type).map((l: any) => l.value);

  // Extract additional image IDs from boardgameimage links
  const imageLinks = links.filter((l: any) => l.type === "boardgameimage");
  const additionalImageIds = imageLinks.map((l: any) => l.id).filter(Boolean);

  // Extract file links (rules PDFs)
  const fileLinks = links.filter((l: any) => l.type === "boardgamefile" || l.type === "file");
  const rulesFiles = fileLinks.map((l: any) => ({
    id: l.id,
    name: l.value,
  })).filter((f: any) => f.id);

  return {
    primaryName: primary?.value ?? thing.name?.value ?? "",
    altNames: alts.map((n: any) => n.value).filter(Boolean),
    sourceIds: {bgg: String(thing.id)},
    year: thing.yearpublished?.value ? Number(thing.yearpublished.value) : undefined,
    minPlayers: thing.minplayers?.value ? Number(thing.minplayers.value) : undefined,
    maxPlayers: thing.maxplayers?.value ? Number(thing.maxplayers.value) : undefined,
    minPlaytime: thing.minplaytime?.value ? Number(thing.minplaytime.value) : undefined,
    maxPlaytime: thing.maxplaytime?.value ? Number(thing.maxplaytime.value) : undefined,
    playingTime: thing.playingtime?.value ? Number(thing.playingtime.value) : undefined,
    designers: getLinkValues("boardgamedesigner"),
    publishers: getLinkValues("boardgamepublisher"),
    categories: getLinkValues("boardgamecategory"),
    mechanics: getLinkValues("boardgamemechanic"),
    image: thing.image ?? undefined,
    thumbnail: thing.thumbnail ?? undefined,
    additionalImages: additionalImageIds.length > 0 ? additionalImageIds : undefined,
    rulesFiles: rulesFiles.length > 0 ? rulesFiles : undefined,
    rating: thing.statistics?.ratings?.average?.value
      ? Number(thing.statistics.ratings.average.value)
      : undefined,
    bayesAverage: thing.statistics?.ratings?.bayesaverage?.value
      ? Number(thing.statistics.ratings.bayesaverage.value)
      : undefined,
    ranks: toArray(thing.statistics?.ratings?.ranks?.rank).map((r: any) => ({
      id: r.id,
      name: r.name,
      value: r.value,
      bayes: r.bayesaverage,
    })),
    fetchedAt: new Date().toISOString(),
    sources: ["bgg"],
    normalized: primary?.value ? normalizeName(primary.value) : undefined,
  };
};

/**
 * Fetches box dimensions from BGG versions endpoint.
 * Returns the first version with any dimension data, or null if none found.
 */
const fetchBoxDimensions = async (
  gameId: string,
  headers: Record<string, string>
): Promise<{boxWidthInches?: number; boxLengthInches?: number; boxDepthInches?: number; boxWeightLbs?: number} | null> => {
  try {
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(gameId)}&versions=1`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp.ok) return null;

    const xml = await resp.text();
    const json = parser.parse(xml);
    const items = toArray(json?.items?.item);
    if (items.length === 0) return null;

    const versions = toArray(items[0]?.versions?.item);
    for (const version of versions) {
      const width = version.width?.value ? Number(version.width.value) : undefined;
      const length = version.length?.value ? Number(version.length.value) : undefined;
      const depth = version.depth?.value ? Number(version.depth.value) : undefined;
      const weight = version.weight?.value ? Number(version.weight.value) : undefined;

      if (width || length || depth || weight) {
        return {
          boxWidthInches: width,
          boxLengthInches: length,
          boxDepthInches: depth,
          boxWeightLbs: weight,
        };
      }
    }
    return null;
  } catch (err) {
    // Versions are optional, don't fail the whole request
    console.debug(`Could not fetch versions for BGG ID ${gameId}:`, err);
    return null;
  }
};

/**
 * BGG API Thing Endpoint - Fetches detailed data for a single game by BGG ID
 * Used for refreshing stale game data when a user selects a game
 * 
 * Query params:
 *   - id: BGG game ID (required)
 * 
 * Returns:
 *   - game: Full game data with stats
 */
export const bggThing = onRequest({secrets: [bggApiToken]}, async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  const now = Date.now();
  if (RATE_MS > 0 && now - lastHit < RATE_MS) {
    res.status(429).json({error: "Rate limit, please retry shortly"});
    return;
  }
  lastHit = now;

  const gameId = (req.query.id as string | undefined)?.trim();
  if (!gameId) {
    res.status(400).json({error: "Missing query param id"});
    return;
  }

  try {
    const token = bggApiToken.value();
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://boardgamegeek.com/",
    };
    if (token) {
      fetchHeaders["Authorization"] = `Bearer ${token}`;
    }
    if (!token) {
      res.status(401).json({error: "Missing BGG_API_TOKEN on server"});
      return;
    }

    const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(gameId)}&stats=1`;
    const thingResp = await fetchWithRetry(thingUrl, fetchHeaders);
    if (!thingResp.ok) {
      const detail = await thingResp.text().catch(() => "");
      console.error("BGG thing failed", {status: thingResp.status, statusText: thingResp.statusText, detail});
      res
        .status(thingResp.status)
        .json({error: "Upstream BGG details failed", detail: thingResp.statusText || thingResp.status, body: detail?.slice(0, 500)});
      return;
    }

    const thingXml = await thingResp.text();
    const thingJson = parser.parse(thingXml);
    const things = toArray(thingJson?.items?.item);

    if (things.length === 0) {
      res.status(404).json({error: "Game not found"});
      return;
    }

    const game = parseThing(things[0]);
    if (!game.primaryName) {
      res.status(404).json({error: "Invalid game data"});
      return;
    }

    // Fetch box dimensions from versions endpoint (optional, doesn't block response)
    const boxDimensions = await fetchBoxDimensions(gameId, fetchHeaders);
    if (boxDimensions) {
      Object.assign(game, boxDimensions);
    }

    res.json({game, id: gameId});
    return;
  } catch (err: any) {
    console.error(err);
    res.status(500).json({error: "Server error", detail: err?.message});
    return;
  }
});

export const bggSearch = onRequest({secrets: [bggApiToken]}, async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  const now = Date.now();
  if (RATE_MS > 0 && now - lastHit < RATE_MS) {
    res.status(429).json({error: "Rate limit, please retry shortly"});
    return;
  }
  lastHit = now;

  const qRaw = (req.query.q as string | undefined)?.trim();
  if (!qRaw) {
    res.status(400).json({error: "Missing query param q"});
    return;
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT),
  );

  try {
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=${encodeURIComponent(
      qRaw,
    )}&exact=0`;
    const token = bggApiToken.value();
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://boardgamegeek.com/",
    };
    if (token) {
      fetchHeaders["Authorization"] = `Bearer ${token}`;
    }
    if (!token) {
      res.status(401).json({error: "Missing BGG_API_TOKEN on server"});
      return;
    }

    const searchResp = await fetchWithRetry(searchUrl, fetchHeaders);
    if (!searchResp.ok) {
      const detail = await searchResp.text().catch(() => "");
      console.error("BGG search failed", {status: searchResp.status, statusText: searchResp.statusText, detail});
      res
        .status(searchResp.status)
        .json({error: "Upstream BGG search failed", detail: searchResp.statusText || searchResp.status, body: detail?.slice(0, 500)});
      return;
    }
    const searchXml = await searchResp.text();
    const searchJson = parser.parse(searchXml);
    const items = toArray(searchJson?.items?.item).slice(0, limit);

    if (items.length === 0) {
      res.json({results: []});
      return;
    }

    const ids = items.map((it: any) => it.id).filter(Boolean);
    const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(",")}&stats=1`;
    const thingResp = await fetchWithRetry(thingUrl, fetchHeaders);
    if (!thingResp.ok) {
      const detail = await thingResp.text().catch(() => "");
      console.error("BGG thing failed", {status: thingResp.status, statusText: thingResp.statusText, detail});
      res
        .status(thingResp.status)
        .json({error: "Upstream BGG details failed", detail: thingResp.statusText || thingResp.status, body: detail?.slice(0, 500)});
      return;
    }
    const thingXml = await thingResp.text();
    const thingJson = parser.parse(thingXml);
    const things = toArray(thingJson?.items?.item);

    const results = things.map(parseThing).filter((r) => r.primaryName);

    res.json({results, query: qRaw});
    return;
  } catch (err: any) {
    console.error(err);
    res.status(500).json({error: "Server error", detail: err?.message});
    return;
  }
});
