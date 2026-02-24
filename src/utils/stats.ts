import type { Tournament, GameSession, ParticipantResult, GameSessionResults } from '../types/tournament';

export interface PlayerStats {
  playerId: string;
  totalPoints: number;
  gamesPlayed: number;
  averagePoints: number;
  results: {
    sessionId: string;
    gameId?: string;
    gameName: string;
    rank: number;
    points: number;
    teamId?: string; // Emoji
  }[];
}

/**
 * Extract flat participant results from session results.
 * Handles both new Phase 3 format (GameSessionResults) and legacy format (ParticipantResult[]).
 */
function extractFlatResults(
  session: GameSession
): { playerId: string; rank: number; points: number; teamId?: string }[] {
  const results = session.results;

  // Check if it's the new format (has 'placements' property)
  if (results && 'placements' in results && Array.isArray((results as GameSessionResults).placements)) {
    const newResults = results as GameSessionResults;
    const flatResults: { playerId: string; rank: number; points: number; teamId?: string }[] = [];

    // Get team assignments from participants array
    const teamMap: Record<string, string | undefined> = {};
    if (Array.isArray(session.participants)) {
      session.participants.forEach((p: any) => {
        if (typeof p !== 'string' && p.teamId) {
          teamMap[p.playerId] = p.teamId;
        }
      });
    }

    for (const placement of newResults.placements) {
      for (const playerId of placement.playerIds) {
        flatResults.push({
          playerId,
          rank: placement.rank,
          points: placement.points ?? 0,
          teamId: teamMap[playerId],
        });
      }
    }

    return flatResults;
  }

  // Legacy format: results is already an array of ParticipantResult
  if (Array.isArray(results)) {
    return (results as unknown as ParticipantResult[]).map(r => ({
      playerId: r.playerId,
      rank: r.rank,
      points: r.points,
      teamId: r.teamId,
    }));
  }

  return [];
}

export function calculateLeaderboard(tournament: Tournament, sessions: GameSession[]): PlayerStats[] {
  const stats: Record<string, PlayerStats> = {};

  // Initialize stats for all players
  tournament.players.forEach(p => {
    stats[p.id] = {
      playerId: p.id,
      totalPoints: 0,
      gamesPlayed: 0,
      averagePoints: 0,
      results: []
    };
  });

  // Process sessions
  sessions.forEach(session => {
    const flatResults = extractFlatResults(session);

    flatResults.forEach(result => {
      if (stats[result.playerId]) {
        stats[result.playerId].totalPoints += result.points;
        stats[result.playerId].gamesPlayed += 1;
        stats[result.playerId].results.push({
          sessionId: session.id,
          gameId: session.gameId,
          gameName: session.gameName,
          rank: result.rank,
          points: result.points,
          teamId: result.teamId
        });
      }
    });
  });

  // Calculate averages (sorting is now done in the component)
  const leaderboard = Object.values(stats).map(stat => ({
    ...stat,
    averagePoints: stat.gamesPlayed > 0 ? Number((stat.totalPoints / stat.gamesPlayed).toFixed(2)) : 0
  }));

  // Initial Sort by Total Points desc
  return leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
}
