import type { GameSession, Tournament, TournamentId, GameSessionId } from '../types/tournament';

export const toEpoch = (value?: string) => {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

type Snapshot = {
  tournaments: Record<TournamentId, Tournament>;
  gameSessions: Record<GameSessionId, GameSession>;
};

/**
 * Check if a user owns a tournament.
 * Returns true if: no ownerId (legacy) or user is owner.
 */
const isOwnerOfTournament = (tournament: Tournament, uid?: string): boolean => {
  if (!uid) return true; // No user filter
  if (!tournament.ownerId) return true; // Legacy tournament without owner
  return tournament.ownerId === uid;
};

/**
 * Check if a user owns or is a member of a tournament.
 * Returns true if: no ownerId (legacy), user is owner, or user is in memberIds.
 */
const canAccessTournament = (tournament: Tournament, uid?: string): boolean => {
  if (!uid) return true; // No user filter, include all
  if (!tournament.ownerId) return true; // Legacy tournament without owner
  if (tournament.ownerId === uid) return true;
  if (tournament.memberIds?.includes(uid)) return true;
  return false;
};

/**
 * Merge local and remote snapshots, preferring newer updatedAt values and ensuring
 * tournament.gameSessions contains all known session ids.
 * 
 * Key behavior:
 * - Remote tournaments always take precedence for non-owners
 * - If a tournament exists locally but not remotely, only owners can keep it
 *   (this prevents viewers from "resurrecting" deleted tournaments)
 * - Sessions are only kept for tournaments that exist in the merged result
 * 
 * @param local - Local snapshot
 * @param remote - Remote snapshot (from Firestore)
 * @param uid - Current user's ID. If provided, local tournaments not owned by this user are excluded.
 */
export const mergeSnapshots = (local: Snapshot, remote: Snapshot, uid?: string): Snapshot => {
  const mergedTournaments: Snapshot['tournaments'] = { ...remote.tournaments };
  const mergedSessions: Snapshot['gameSessions'] = { ...remote.gameSessions };

  const upsertTournament = (t: Tournament) => {
    // Skip local tournaments that don't belong to the current user
    if (!canAccessTournament(t, uid)) {
      return;
    }

    const existing = mergedTournaments[t.id];
    if (!existing) {
      // Tournament exists locally but not remotely
      // Only add it if the current user is the OWNER
      // This prevents viewers from resurrecting tournaments that the owner deleted
      if (isOwnerOfTournament(t, uid)) {
        mergedTournaments[t.id] = t;
      }
      // If not owner, the tournament was deleted by owner - don't add it back
      return;
    }
    const localNewer = toEpoch(t.updatedAt) > toEpoch(existing.updatedAt);
    mergedTournaments[t.id] = localNewer ? t : existing;
  };

  // Start with remote, then overlay local where newer or missing
  Object.values(local.tournaments).forEach(upsertTournament);

  // Merge sessions: prefer newer; ensure tournament.gameSessions includes all known ids
  // Sessions may be tournament-linked or casual (no tournamentId)
  Object.values(local.gameSessions).forEach(session => {
    const existing = mergedSessions[session.id];
    if (!existing || toEpoch(session.updatedAt) > toEpoch(existing.updatedAt)) {
      mergedSessions[session.id] = session;
    }

    // For tournament-linked sessions, ensure tournament.gameSessions includes the session ID
    if (session.tournamentId) {
      const t = mergedTournaments[session.tournamentId];
      if (t && !t.gameSessions.includes(session.id)) {
        mergedTournaments[session.tournamentId] = {
          ...t,
          gameSessions: [...t.gameSessions, session.id],
        };
      }
    }
  });

  return { tournaments: mergedTournaments, gameSessions: mergedSessions };
};


