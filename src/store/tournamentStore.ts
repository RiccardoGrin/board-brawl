import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Tournament,
  Player,
  GameSession,
  GameSessionId,
  TournamentId,
  PlayerId,
  TournamentFormat,
  GameMeta,
  GameSessionParticipant,
  GameSessionPlacement,
  GameSessionResults,
  ParticipantResult
} from '../types/tournament';
import { getRandomColor } from '../utils/colors';
import { useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';
import { deleteGameSessionRemote, deleteTournamentRemote, syncTournamentDocument } from '../services/firestoreSync';
import { generateBracket, recordMatchWinner, isRoundComplete } from '../utils/bracketGenerator';

interface TournamentStore {
  activeTournamentId: TournamentId | null;
  tournaments: Record<TournamentId, Tournament>;
  gameSessions: Record<GameSessionId, GameSession>;

  // Actions
  createTournament: (name: string, description: string | undefined, players: {name: string, color?: string, userId?: string, userCode?: string}[], format?: TournamentFormat, gameTitle?: string, gameDetails?: { gameId?: string; gameSourceIds?: { bgg?: string }; gameMeta?: GameMeta }) => void;
  updateTournament: (id: TournamentId, updates: Partial<Pick<Tournament, 'name' | 'description'>>) => void;
  loadTournament: (id: TournamentId) => void;
  finishTournament: (id: TournamentId) => void;
  reopenTournament: (id: TournamentId) => void;
  resetStore: () => void;
  
  addPlayer: (tournamentId: TournamentId, name: string, color?: string, userId?: string, userCode?: string) => void;
  updatePlayer: (tournamentId: TournamentId, playerId: PlayerId, updates: Partial<Player>) => void;
  removePlayer: (tournamentId: TournamentId, playerId: PlayerId) => boolean;
  updateLinkedPlayerNames: (userId: string, newDisplayName: string) => void;
  
  // Bracket-specific actions
  updateBracketMatch: (tournamentId: TournamentId, matchId: string, winnerId: PlayerId | null) => void;
  regenerateBracket: (tournamentId: TournamentId) => void;
  
  addGameSession: (session: GameSession) => void;
  updateGameSession: (sessionId: GameSessionId, updates: Partial<GameSession>) => void;
  deleteGameSession: (tournamentId: TournamentId, sessionId: GameSessionId) => void;
  deleteTournament: (tournamentId: TournamentId) => void;

  // Getters
  getTournament: (id: TournamentId) => Tournament | undefined;
  getTournamentSessions: (id: TournamentId) => GameSession[];

  // Hydration
  hydrateFromSnapshot: (payload: {
    tournaments: Record<TournamentId, Tournament>;
    gameSessions: Record<GameSessionId, GameSession>;
    activeTournamentId: TournamentId | null;
  }) => void;
}

// Use Web Crypto for collision-resistant IDs.
const generateId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/**
 * Convert legacy ParticipantResult[] to new GameSessionResults format.
 * This helps bridge the old UI code with the new data model.
 */
export const convertToNewResultsFormat = (
  results: ParticipantResult[],
  gameType: 'ffa' | 'team'
): GameSessionResults => {
  const mode = gameType === 'ffa' ? 'freeForAll' : 'teams';

  // Group results by rank
  const rankGroups = new Map<number, { playerIds: string[]; points?: number }>();
  for (const result of results) {
    const existing = rankGroups.get(result.rank);
    if (existing) {
      existing.playerIds.push(result.playerId);
    } else {
      rankGroups.set(result.rank, {
        playerIds: [result.playerId],
        points: result.points,
      });
    }
  }

  const placements = Array.from(rankGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([rank, data]) => ({
      rank,
      playerIds: data.playerIds,
      points: data.points,
    }));

  return { mode, placements };
};

/**
 * Convert new GameSessionResults format back to legacy ParticipantResult[].
 * Used for backward compatibility with existing UI components.
 */
export const convertFromNewResultsFormat = (
  results: GameSessionResults,
  participantTeams?: Record<string, string>
): ParticipantResult[] => {
  const legacyResults: ParticipantResult[] = [];

  for (const placement of results.placements) {
    for (const playerId of placement.playerIds) {
      legacyResults.push({
        playerId,
        teamId: participantTeams?.[playerId],
        rank: placement.rank,
        points: placement.points ?? 0,
      });
    }
  }

  return legacyResults.sort((a, b) => a.rank - b.rank);
};

/**
 * Extract participant user IDs from participants array.
 */
const extractParticipantUserIds = (participants: GameSessionParticipant[]): string[] => {
  return participants
    .map((p) => p.userId)
    .filter((uid): uid is string => !!uid);
};

/**
 * Extract winner user IDs from results and participants.
 */
const extractWinnerUserIds = (
  results: GameSessionResults,
  participants: GameSessionParticipant[]
): string[] => {
  // Get the first place player IDs
  const firstPlacePlacement = results.placements.find((p) => p.rank === 1);
  if (!firstPlacePlacement) return [];

  // Map winner player IDs to user IDs
  const winnerUserIds: string[] = [];
  for (const playerId of firstPlacePlacement.playerIds) {
    const participant = participants.find((p) => p.playerId === playerId);
    if (participant?.userId) {
      winnerUserIds.push(participant.userId);
    }
  }

  return winnerUserIds;
};

const maybePersistTournament = async (get: () => TournamentStore, tournamentId: TournamentId) => {
  console.log('[maybePersistTournament] Called for tournament:', tournamentId);
  const user = useAuthStore.getState().user;
  if (!user) {
    console.log('[maybePersistTournament] No user, skipping');
    return;
  }
  const sync = useSyncStore.getState();
  const state = get();
  const tournament = state.tournaments[tournamentId];
  if (!tournament) {
    console.log('[maybePersistTournament] Tournament not found in state, skipping');
    return;
  }
  const sessions = tournament.gameSessions
    .map(id => state.gameSessions[id])
    .filter((s): s is GameSession => Boolean(s));
  try {
    console.log('[maybePersistTournament] Starting sync for tournament:', tournamentId);
    sync.start();
    await syncTournamentDocument(user.uid, tournament, sessions);
    sync.success();
    console.log('[maybePersistTournament] Sync completed successfully for tournament:', tournamentId);
  } catch (error) {
    console.error('Failed to persist tournament to Firestore', { tournamentId, error });
    sync.fail('Sync failed. Your changes are saved locally and will retry.');
  }
};

const maybeDeleteSessionRemote = async (
  get: () => TournamentStore,
  tournamentId: TournamentId,
  sessionId: GameSessionId
) => {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const sync = useSyncStore.getState();
  const state = get();
  const tournament = state.tournaments[tournamentId];
  if (!tournament) return;
  const remainingSessions = tournament.gameSessions
    .filter(id => id !== sessionId)
    .map(id => state.gameSessions[id])
    .filter((s): s is GameSession => Boolean(s));
  try {
    sync.start();
    await deleteGameSessionRemote(user.uid, tournament, sessionId, remainingSessions);
    sync.success();
  } catch (error) {
    console.warn('Failed to delete session in Firestore', error);
    sync.fail('Sync failed. Your changes are saved locally and will retry.');
  }
};

const maybeDeleteTournamentRemote = async (tournamentId: TournamentId) => {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const sync = useSyncStore.getState();
  try {
    sync.start();
    await deleteTournamentRemote(user.uid, tournamentId);
    sync.success();
  } catch (error) {
    console.warn('Failed to delete tournament in Firestore', error);
    sync.fail('Sync failed. Your changes are saved locally and will retry.');
  }
};

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set, get) => ({
      activeTournamentId: null,
      tournaments: {},
      gameSessions: {},

      createTournament: (name, description, playersData, format, gameTitle, gameDetails) => {
        const id = generateId();
        const currentUser = useAuthStore.getState().user;
        const userProfile = useAuthStore.getState().userProfile;
        const ownerId = currentUser?.uid;
        
        // Collect all linked user IDs (including owner)
        const linkedUserIds = playersData
          .map(p => p.userId)
          .filter((uid): uid is string => !!uid);
        
        // Build memberIds: owner + linked players (deduplicated)
        const allMemberIds = ownerId 
          ? [ownerId, ...linkedUserIds.filter(uid => uid !== ownerId)]
          : linkedUserIds;
        const memberIds = allMemberIds.length > 0 ? allMemberIds : undefined;
        
        // Build memberRoles: owner is 'owner', linked players are 'viewer'
        const memberRoles: Record<string, 'owner' | 'editor' | 'viewer'> = {};
        if (ownerId) {
          memberRoles[ownerId] = 'owner';
        }
        linkedUserIds.forEach(uid => {
          if (uid !== ownerId) {
            memberRoles[uid] = 'viewer';
          }
        });
        
        // Display name priority: user-set displayName > Google displayName > Player #code > undefined
        const ownerName = userProfile.displayName || 
          currentUser?.displayName || 
          (userProfile.userCode ? `Player #${userProfile.userCode}` : undefined);
        
        // Generate colors sequentially for new tournament
        const existingColors: string[] = [];
        const players: Player[] = playersData.map(p => {
          const color = p.color || getRandomColor(existingColors);
          existingColors.push(color);
          return {
            id: generateId(),
            name: p.name,
            color,
            userId: p.userId,
            userCode: p.userCode,
          };
        });

        // Create bracket config if format is 'bracket'
        let bracketConfig = undefined;
        if (format === 'bracket') {
          if (players.length < 4) {
            throw new Error('Bracket tournaments require at least 4 players');
          }
          if (!gameTitle) {
            throw new Error('Bracket tournaments require a game title');
          }
          
          const bracket = generateBracket(players);
          const totalRounds = Math.max(...bracket.map(m => m.round), 1);
          
          bracketConfig = {
            gameTitle,
            gameId: gameDetails?.gameId,
            gameSourceIds: gameDetails?.gameSourceIds,
            gameMeta: gameDetails?.gameMeta,
            totalRounds,
            currentRound: 1,
            hasStarted: false,
            bracket,
          };
        }

        const newTournament: Tournament = {
          id,
          name,
          description,
          date: new Date().toISOString(),
          state: 'active',
          players,
          gameSessions: [],
          ownerId,
          memberIds,
          memberRoles: Object.keys(memberRoles).length > 0 ? memberRoles : undefined,
          ownerName,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          format,
          bracketConfig,
        };

        set(state => ({
          tournaments: { ...state.tournaments, [id]: newTournament },
          activeTournamentId: id,
        }));

        void maybePersistTournament(get, id);
      },

      updateTournament: (id, updates) => {
        set(state => {
          const tournament = state.tournaments[id];
          if (!tournament) {
            return state;
          }

          const currentUser = useAuthStore.getState().user;
          const userProfile = useAuthStore.getState().userProfile;
          const ownerId = tournament.ownerId || currentUser?.uid;
          const memberIds = tournament.memberIds?.length ? tournament.memberIds : (ownerId ? [ownerId] : []);
          const memberRoles = tournament.memberRoles ?? (ownerId ? { [ownerId]: 'owner' } : undefined);
          // Display name priority: user-set displayName > Google displayName > Player #code > undefined
          // Preserve existing ownerName if already set
          const ownerName = tournament.ownerName || 
            userProfile.displayName || 
            currentUser?.displayName || 
            (userProfile.userCode ? `Player #${userProfile.userCode}` : undefined);
          return {
            tournaments: {
              ...state.tournaments,
              [id]: { ...tournament, ...updates, ownerId, memberIds, memberRoles, ownerName, updatedAt: nowIso() }
            }
          };
        });

        void maybePersistTournament(get, id);
      },

      loadTournament: (id) => set({ activeTournamentId: id }),

      finishTournament: (id) => {
        set(state => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: { ...tournament, state: 'finished', updatedAt: nowIso() }
            }
          };
        });

        void maybePersistTournament(get, id);
      },

      reopenTournament: (id) => {
        set(state => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: { ...tournament, state: 'active', updatedAt: nowIso() }
            }
          };
        });

        void maybePersistTournament(get, id);
      },

      resetStore: () => {
        set(() => ({
          activeTournamentId: null,
          tournaments: {},
          gameSessions: {},
        }));
        try {
          localStorage.removeItem('tournament-storage');
        } catch (error) {
          console.warn('Failed to clear local storage', error);
        }
      },

      addPlayer: (tournamentId, name, color, userId, userCode) => {
        const state = get();
        const tournament = state.tournaments[tournamentId];
        if (!tournament) return;

        set(state => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          const existingColors = tournament.players.map(p => p.color).filter((c): c is string => !!c);
          const newPlayer: Player = {
            id: generateId(),
            name,
            color: color || getRandomColor(existingColors),
            userId,
            userCode,
          };

          // If a linked userId is provided, add them to memberIds with viewer role
          let memberIds = tournament.memberIds || [];
          let memberRoles = tournament.memberRoles || {};
          
          if (userId && !memberIds.includes(userId)) {
            memberIds = [...memberIds, userId];
            memberRoles = { ...memberRoles, [userId]: 'viewer' };
          }

          const updatedPlayers = [...tournament.players, newPlayer];
          
          // Regenerate bracket if this is a bracket tournament
          let bracketConfig = tournament.bracketConfig;
          if (tournament.format === 'bracket' && bracketConfig) {
            // Only regenerate if player count is valid (4, 8, 16, 32)
            const validCounts = [4, 8, 16, 32];
            if (validCounts.includes(updatedPlayers.length)) {
              const newBracket = generateBracket(updatedPlayers);
              bracketConfig = {
                ...bracketConfig,
                bracket: newBracket,
                totalRounds: Math.max(...newBracket.map(m => m.round), 1),
                currentRound: 1,
                hasStarted: false, // Reset started state
              };
            }
          }

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players: updatedPlayers,
                memberIds,
                memberRoles,
                bracketConfig,
                updatedAt: nowIso(),
              }
            }
          };
        });

        void maybePersistTournament(get, tournamentId);
      },

      updatePlayer: (tournamentId, playerId, updates) => {
        set(state => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          const currentPlayer = tournament.players.find(p => p.id === playerId);
          if (!currentPlayer) return state;

          // Handle userId changes (linking/unlinking/changing)
          let memberIds = tournament.memberIds || [];
          let memberRoles = { ...(tournament.memberRoles || {}) };

          // If userId is being updated
          if ('userId' in updates) {
            const oldUserId = currentPlayer.userId;
            const newUserId = updates.userId;

            // Duplicate prevention: check if another player already has this userId
            if (newUserId) {
              const isUserIdAlreadyLinked = tournament.players.some(
                p => p.id !== playerId && p.userId === newUserId
              );
              if (isUserIdAlreadyLinked) {
                console.warn('Cannot link user - already linked to another player in this tournament');
                return state;
              }
            }

            // Remove old userId from memberIds/roles (unless it's the owner)
            if (oldUserId && oldUserId !== tournament.ownerId) {
              memberIds = memberIds.filter(id => id !== oldUserId);
              delete memberRoles[oldUserId];
            }

            // Add new userId to memberIds/roles (if provided and not owner)
            if (newUserId && newUserId !== tournament.ownerId && !memberIds.includes(newUserId)) {
              memberIds = [...memberIds, newUserId];
              memberRoles[newUserId] = 'viewer';
            }
          }

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players: tournament.players.map(p => 
                  p.id === playerId ? { ...p, ...updates } : p
                ),
                memberIds,
                memberRoles,
                updatedAt: nowIso(),
              }
            }
          };
        });

        void maybePersistTournament(get, tournamentId);
      },

      removePlayer: (tournamentId, playerId) => {
        const state = get();
        const tournament = state.tournaments[tournamentId];
        if (!tournament) return false;

        // For accumulative tournaments, check if player has played
        if (tournament.format !== 'bracket') {
          const hasPlayed = tournament.gameSessions.some(sessionId => {
            const session = state.gameSessions[sessionId];
            if (!session?.participants) return false;
            // Handle both old format (string[]) and new format (GameSessionParticipant[])
            return session.participants.some((p: any) =>
              typeof p === 'string' ? p === playerId : p.playerId === playerId
            );
          });

          if (hasPlayed) {
            console.warn("Cannot remove player who has already played games.");
            return false; 
          }
        }

        set(state => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          // Find the player being removed
          const playerToRemove = tournament.players.find(p => p.id === playerId);
          
          // If this player has a linked userId, remove them from memberIds and memberRoles
          // (but only if they're not the owner)
          let memberIds = tournament.memberIds || [];
          let memberRoles = { ...(tournament.memberRoles || {}) };
          
          if (playerToRemove?.userId && playerToRemove.userId !== tournament.ownerId) {
            memberIds = memberIds.filter(id => id !== playerToRemove.userId);
            delete memberRoles[playerToRemove.userId];
          }

          const updatedPlayers = tournament.players.filter(p => p.id !== playerId);
          
          // Regenerate bracket if this is a bracket tournament
          let bracketConfig = tournament.bracketConfig;
          if (tournament.format === 'bracket' && bracketConfig) {
            // Only regenerate if player count is valid (4, 8, 16, 32)
            const validCounts = [4, 8, 16, 32];
            if (validCounts.includes(updatedPlayers.length)) {
              const newBracket = generateBracket(updatedPlayers);
              bracketConfig = {
                ...bracketConfig,
                bracket: newBracket,
                totalRounds: Math.max(...newBracket.map(m => m.round), 1),
                currentRound: 1,
                hasStarted: false, // Reset started state
              };
            }
          }

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players: updatedPlayers,
                memberIds,
                memberRoles,
                bracketConfig,
                updatedAt: nowIso(),
              }
            }
          };
        });

        void maybePersistTournament(get, tournamentId);
        return true;
      },

      updateLinkedPlayerNames: (userId, newDisplayName) => {
        set(state => {
          const updatedTournaments = { ...state.tournaments };
          let hasChanges = false;

          // Update player names in all tournaments where this user is linked
          Object.keys(updatedTournaments).forEach(tournamentId => {
            const tournament = updatedTournaments[tournamentId];
            const updatedPlayers = tournament.players.map(player => {
              if (player.userId === userId && player.name !== newDisplayName) {
                hasChanges = true;
                return { ...player, name: newDisplayName };
              }
              return player;
            });

            if (hasChanges) {
              updatedTournaments[tournamentId] = {
                ...tournament,
                players: updatedPlayers,
                updatedAt: nowIso(),
              };
            }
          });

          return hasChanges ? { tournaments: updatedTournaments } : state;
        });
      },

      addGameSession: (session) => {
        const currentUser = useAuthStore.getState().user;
        const now = nowIso();

        set(state => {
          // For tournament sessions, require a tournament
          const tournament = session.tournamentId ? state.tournaments[session.tournamentId] : null;
          if (session.tournamentId && !tournament) return state;

          // Ensure required Phase 3 fields are set
          const enrichedSession: GameSession = {
            ...session,
            ownerId: session.ownerId || currentUser?.uid || '',
            createdAt: session.createdAt || now,
            updatedAt: now,
            playedAt: session.playedAt || session.datePlayed || now,
            status: session.status || 'complete',
            participantUserIds: session.participantUserIds || extractParticipantUserIds(session.participants),
            winnerUserIds: session.winnerUserIds || extractWinnerUserIds(session.results, session.participants),
            gameThumbnail: session.gameThumbnail || session.gameMeta?.thumbnail,
          };

          // If linked to a tournament, update the tournament's session list
          if (tournament && session.tournamentId) {
            return {
              gameSessions: { ...state.gameSessions, [session.id]: enrichedSession },
              tournaments: {
                ...state.tournaments,
                [session.tournamentId]: {
                  ...tournament,
                  gameSessions: [...tournament.gameSessions, session.id],
                  updatedAt: now,
                }
              }
            };
          }

          // For future casual sessions without tournament
          return {
            gameSessions: { ...state.gameSessions, [session.id]: enrichedSession },
          };
        });

        if (session.tournamentId) {
          void maybePersistTournament(get, session.tournamentId);
        }
      },

      updateGameSession: (sessionId, updates) => {
        const now = nowIso();

        set(state => {
          const existingSession = state.gameSessions[sessionId];
          if (!existingSession) return state;

          // Re-calculate derived fields if results or participants changed
          const updatedSession: GameSession = {
            ...existingSession,
            ...updates,
            updatedAt: now,
          };

          // Update participant and winner user IDs if participants or results changed
          if (updates.participants || updates.results) {
            updatedSession.participantUserIds = extractParticipantUserIds(updatedSession.participants);
            updatedSession.winnerUserIds = extractWinnerUserIds(updatedSession.results, updatedSession.participants);
          }

          // Update thumbnail if gameMeta changed
          if (updates.gameMeta) {
            updatedSession.gameThumbnail = updates.gameMeta.thumbnail;
          }

          return {
            gameSessions: {
              ...state.gameSessions,
              [sessionId]: updatedSession
            }
          };
        });

        const session = get().gameSessions[sessionId];
        if (session?.tournamentId) {
          void maybePersistTournament(get, session.tournamentId);
        }
      },

      deleteGameSession: (tournamentId, sessionId) => {
        set(state => {
          const { [sessionId]: deleted, ...remainingSessions } = state.gameSessions;

          // If tournament exists, remove session from its list
          if (tournamentId) {
            const tournament = state.tournaments[tournamentId];
            if (tournament) {
              return {
                gameSessions: remainingSessions,
                tournaments: {
                  ...state.tournaments,
                  [tournamentId]: {
                    ...tournament,
                    gameSessions: tournament.gameSessions.filter(id => id !== sessionId),
                    updatedAt: nowIso(),
                  }
                }
              };
            }
          }

          // For sessions without tournament or tournament not found
          return { gameSessions: remainingSessions };
        });

        if (tournamentId) {
          void maybeDeleteSessionRemote(get, tournamentId, sessionId);
        }
      },

      deleteTournament: (tournamentId) => {
        set(state => {
          const { [tournamentId]: removedTournament, ...remainingTournaments } = state.tournaments;
          const remainingSessions = { ...state.gameSessions };
          removedTournament?.gameSessions.forEach(id => {
            delete remainingSessions[id];
          });
          const nextActive = state.activeTournamentId === tournamentId
            ? Object.keys(remainingTournaments)[0] ?? null
            : state.activeTournamentId;

          return {
            tournaments: remainingTournaments,
            gameSessions: remainingSessions,
            activeTournamentId: nextActive,
          };
        });

        void maybeDeleteTournamentRemote(tournamentId);
      },

      getTournament: (id) => get().tournaments[id],
      
      getTournamentSessions: (id) => {
        const tournament = get().tournaments[id];
        if (!tournament) return [];
        return tournament.gameSessions.map(sessionId => get().gameSessions[sessionId]);
      },

      hydrateFromSnapshot: (payload) => {
        set(() => ({
          tournaments: payload.tournaments,
          gameSessions: payload.gameSessions,
          activeTournamentId: payload.activeTournamentId,
        }));
      },

      // Bracket-specific actions
      updateBracketMatch: (tournamentId, matchId, winnerId) => {
        // Guard against null winnerId - a completed match must have a winner
        if (!winnerId) {
          return;
        }

        const currentUser = useAuthStore.getState().user;
        const now = nowIso();

        set(state => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament || !tournament.bracketConfig) {
            return state;
          }

          const bracketConfig = tournament.bracketConfig;

          // Update the match with the winner
          const updatedBracket = recordMatchWinner(bracketConfig.bracket, matchId, winnerId);

          // Find the completed match
          const completedMatch = updatedBracket.find(m => m.id === matchId);
          if (!completedMatch) {
            return state;
          }

          // Determine the loser (player1Id and player2Id can be null for pending matches)
          const loserIdRaw = completedMatch.player1Id === winnerId
            ? completedMatch.player2Id
            : completedMatch.player1Id;
          const loserId: string | undefined = loserIdRaw ?? undefined;

          // Build GameSession for this bracket match
          const winner = tournament.players.find(p => p.id === winnerId);
          const loser = loserId ? tournament.players.find(p => p.id === loserId) : undefined;

          // Build participants list
          const participants: GameSessionParticipant[] = [
            { playerId: winnerId, userId: winner?.userId, name: winner?.name || 'Unknown' },
          ];
          if (loserId && loser) {
            participants.push({ playerId: loserId, userId: loser.userId, name: loser.name || 'Unknown' });
          }

          // Build placements list
          const placements: GameSessionPlacement[] = [
            { rank: 1, playerIds: [winnerId], points: 1 },
          ];
          if (loserId) {
            placements.push({ rank: 2, playerIds: [loserId], points: 0 });
          }

          const sessionId = generateId();
          const bracketSession: GameSession = {
            id: sessionId,
            ownerId: currentUser?.uid || tournament.ownerId || '',
            createdAt: now,
            updatedAt: now,
            playedAt: now,

            // Game info from bracketConfig
            gameName: bracketConfig.gameTitle,
            gameId: bracketConfig.gameId,
            gameSourceIds: bracketConfig.gameSourceIds,
            gameMeta: bracketConfig.gameMeta,
            gameThumbnail: bracketConfig.gameMeta?.thumbnail,

            // Linking
            tournamentId: tournament.id,
            bracketMatchId: matchId,

            // Lifecycle
            status: 'complete',

            // Scoring - always bracket preset
            preset: 'bracket',
            scoringRules: { first: 1, second: 0, third: 0, others: 0 },

            // Participants
            participants,
            participantUserIds: [winner?.userId, loser?.userId].filter((id): id is string => !!id),
            winnerUserIds: winner?.userId ? [winner.userId] : [],

            // Results
            results: {
              mode: 'freeForAll',
              placements,
            },
          };

          // Advance round if the match's round is complete
          let currentRound = bracketConfig.currentRound;
          if (isRoundComplete(updatedBracket, completedMatch.round)) {
            currentRound = Math.max(currentRound, completedMatch.round + 1);
          }

          // Check if tournament is complete (finals done)
          const finalsMatch = updatedBracket.find(m => m.round === bracketConfig.totalRounds);
          const isComplete = finalsMatch?.isComplete || false;

          return {
            gameSessions: { ...state.gameSessions, [sessionId]: bracketSession },
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                gameSessions: [...tournament.gameSessions, sessionId],
                bracketConfig: {
                  ...bracketConfig,
                  bracket: updatedBracket,
                  hasStarted: true,
                  currentRound,
                },
                state: isComplete ? 'finished' : tournament.state,
                updatedAt: now,
              }
            }
          };
        });

        void maybePersistTournament(get, tournamentId);
      },

      regenerateBracket: (tournamentId) => {
        set(state => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament || !tournament.bracketConfig) return state;
          
          if (tournament.bracketConfig.hasStarted) {
            console.warn('Cannot regenerate bracket after tournament has started');
            return state;
          }
          
          const newBracket = generateBracket(tournament.players);
          
          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                bracketConfig: {
                  ...tournament.bracketConfig,
                  bracket: newBracket,
                  totalRounds: Math.max(...newBracket.map(m => m.round), 1),
                  currentRound: 1,
                  hasStarted: false,
                },
                updatedAt: nowIso(),
              }
            }
          };
        });

        void maybePersistTournament(get, tournamentId);
      },
    }),
    {
      name: 'tournament-storage',
    }
  )
);
