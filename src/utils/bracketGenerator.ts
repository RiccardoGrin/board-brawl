import type { BracketMatch, Player, PlayerId } from '../types/tournament';

/**
 * Generate a single-elimination bracket from a list of players.
 * Players are seeded in the order they appear (first = seed #1).
 * 
 * @param players - Array of players to include in the bracket
 * @returns Array of bracket matches with proper linking
 */
export function generateBracket(players: Player[]): BracketMatch[] {
  // Validate: must be a power of 2 (4, 8, 16, 32)
  const validCounts = [4, 8, 16, 32];
  if (!validCounts.includes(players.length)) {
    throw new Error('Bracket tournaments require exactly 4, 8, 16, or 32 players');
  }

  // Calculate total rounds needed (simple since it's power of 2)
  const totalRounds = Math.log2(players.length);
  const bracket: BracketMatch[] = [];

  // Build bracket from bottom up (Round 1 -> Finals)
  for (let round = 1; round <= totalRounds; round++) {
    // Each round has half the matches of the previous round
    const matchesInRound = Math.pow(2, totalRounds - round);

    for (let matchNum = 0; matchNum < matchesInRound; matchNum++) {
      const matchId = `r${round}m${matchNum}`;

      // Determine which match this feeds into (if not finals)
      let feedsIntoMatchId: string | undefined = undefined;
      if (round < totalRounds) {
        const nextRoundMatchNum = Math.floor(matchNum / 2);
        feedsIntoMatchId = `r${round + 1}m${nextRoundMatchNum}`;
      }

      bracket.push({
        id: matchId,
        round,
        matchNumber: matchNum,
        player1Id: null,
        player2Id: null,
        winnerId: undefined,
        isComplete: false,
        feedsIntoMatchId,
        completedAt: undefined,
      });
    }
  }

  // Seed players into Round 1 matches (sequential order)
  const round1Matches = bracket.filter(m => m.round === 1);
  for (let i = 0; i < round1Matches.length; i++) {
    const match = round1Matches[i];
    match.player1Id = players[i * 2]?.id || null;
    match.player2Id = players[i * 2 + 1]?.id || null;
  }

  return bracket;
}

/**
 * Record a match winner and advance them to the next round.
 * Pass null as winnerId to clear/reset the match.
 * 
 * @param bracket - Current bracket state
 * @param matchId - ID of the match to update
 * @param winnerId - ID of the winning player, or null to reset
 * @returns Updated bracket array
 */
export function recordMatchWinner(
  bracket: BracketMatch[],
  matchId: string,
  winnerId: PlayerId | null
): BracketMatch[] {
  // Find the match being updated
  const matchToUpdate = bracket.find(m => m.id === matchId);
  if (!matchToUpdate) {
    return bracket;
  }

  // If clearing the winner, we need to remove this player from subsequent matches
  const oldWinnerId = matchToUpdate.winnerId;

  const updatedBracket = bracket.map(match => {
    if (match.id === matchId) {
      if (winnerId === null) {
        // Clear the match result
        return {
          ...match,
          winnerId: undefined,
          isComplete: false,
          completedAt: undefined,
        };
      } else {
        // Validate winner is one of the players
        if (match.player1Id !== winnerId && match.player2Id !== winnerId) {
          throw new Error('Winner must be one of the match participants');
        }

        return {
          ...match,
          winnerId,
          isComplete: true,
          completedAt: new Date().toISOString(),
        };
      }
    }
    return match;
  });

  // If we cleared the winner, remove them from next match
  if (winnerId === null && oldWinnerId && matchToUpdate.feedsIntoMatchId) {
    return updatedBracket.map(match => {
      if (match.id === matchToUpdate.feedsIntoMatchId) {
        // Remove the old winner from this match
        const newMatch = { ...match };
        if (match.player1Id === oldWinnerId) {
          newMatch.player1Id = null;
        } else if (match.player2Id === oldWinnerId) {
          newMatch.player2Id = null;
        }
        return newMatch;
      }
      return match;
    });
  }

  // Find the updated match to get feedsIntoMatchId
  const updatedMatch = updatedBracket.find(m => m.id === matchId);
  if (!updatedMatch || !updatedMatch.feedsIntoMatchId || !winnerId) {
    return updatedBracket;
  }

  // Advance winner to next match (replacing old winner if needed)
  return updatedBracket.map(match => {
    if (match.id === updatedMatch.feedsIntoMatchId) {
      // Determine which slot this match should feed into
      const prevRoundMatches = updatedBracket.filter(
        m => m.feedsIntoMatchId === match.id && m.round === updatedMatch.round
      );
      const matchIndex = prevRoundMatches.findIndex(m => m.id === matchId);
      
      // Place winner in appropriate slot based on match order
      if (matchIndex === 0 || matchIndex === -1) {
        return { ...match, player1Id: winnerId };
      } else {
        return { ...match, player2Id: winnerId };
      }
    }
    return match;
  });
}

/**
 * Get all matches that are ready to be played (both players present, not complete).
 * 
 * @param bracket - Current bracket state
 * @returns Array of playable matches
 */
export function getPlayableMatches(bracket: BracketMatch[]): BracketMatch[] {
  return bracket.filter(
    match =>
      !match.isComplete &&
      match.player1Id !== null &&
      match.player2Id !== null
  );
}

/**
 * Check if all matches in a given round are complete.
 * 
 * @param bracket - Current bracket state
 * @param round - Round number to check
 * @returns True if all matches in the round are complete
 */
export function isRoundComplete(bracket: BracketMatch[], round: number): boolean {
  const roundMatches = bracket.filter(m => m.round === round);
  return roundMatches.length > 0 && roundMatches.every(m => m.isComplete);
}

/**
 * Get a human-readable name for a round.
 * 
 * @param round - Round number (1-based)
 * @param totalRounds - Total number of rounds in the bracket
 * @returns Round name (e.g., "Finals", "Semi-Finals", "Round 1")
 */
export function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) {
    return 'Finals';
  }
  if (round === totalRounds - 1) {
    return 'Semi-Finals';
  }
  if (round === totalRounds - 2) {
    return 'Quarter-Finals';
  }
  return `Round ${round}`;
}

/**
 * Player standing information for bracket tournaments
 */
export interface PlayerStanding {
  playerId: PlayerId;
  rank: number;
  wins: number;
  losses: number;
  placement: string; // "Champion", "Finals", "Semi-Finals", "Round X"
}

/**
 * Calculate standings for a bracket tournament.
 * 
 * @param bracket - Current bracket state
 * @param players - Array of all players in the tournament
 * @returns Array of player standings sorted by placement
 */
export function calculateStandings(
  bracket: BracketMatch[],
  players: Player[]
): PlayerStanding[] {
  const totalRounds = Math.max(...bracket.map(m => m.round), 1);
  const standings: PlayerStanding[] = [];

  players.forEach(player => {
    const playerId = player.id;
    
    // Find all matches this player participated in
    const playerMatches = bracket.filter(
      m => m.player1Id === playerId || m.player2Id === playerId
    );

    // Count wins and losses
    const wins = playerMatches.filter(m => m.winnerId === playerId).length;
    const losses = playerMatches.filter(
      m => m.isComplete && m.winnerId && m.winnerId !== playerId
    ).length;

    // Determine placement based on the highest round reached
    let placement = 'Participant';
    let highestRound = 0;

    playerMatches.forEach(match => {
      if (match.winnerId === playerId) {
        highestRound = Math.max(highestRound, match.round);
      } else if (match.isComplete && match.winnerId) {
        // Lost in this round - they still reached it
        highestRound = Math.max(highestRound, match.round);
      }
    });

    // Check if player won the finals
    const finalsMatch = bracket.find(m => m.round === totalRounds);
    if (finalsMatch?.winnerId === playerId) {
      placement = 'Champion';
    } else if (finalsMatch?.isComplete && 
               (finalsMatch.player1Id === playerId || finalsMatch.player2Id === playerId)) {
      placement = 'Finals';
    } else if (highestRound === totalRounds - 1) {
      placement = 'Semi-Finals';
    } else if (highestRound === totalRounds - 2) {
      placement = 'Quarter-Finals';
    } else if (highestRound > 0) {
      placement = `Eliminated in ${getRoundName(highestRound, totalRounds)}`;
    }

    // Rank order: Champion (1), Finals (2), Semi-Finals (3-4), etc.
    let rank = players.length;
    if (placement === 'Champion') {
      rank = 1;
    } else if (placement === 'Finals') {
      rank = 2;
    } else if (placement === 'Semi-Finals') {
      rank = 3; // Will be tied
    } else {
      // Higher round reached = better rank, always below semi-finals (rank 3)
      rank = 4 + (totalRounds - highestRound);
    }

    standings.push({
      playerId,
      rank,
      wins,
      losses,
      placement,
    });
  });

  // Sort by rank (ascending), then by wins (descending)
  standings.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.wins - a.wins;
  });

  // Reassign ranks to handle ties properly
  let currentRank = 1;
  standings.forEach((standing, index) => {
    if (index > 0) {
      const prev = standings[index - 1];
      if (standing.placement !== prev.placement) {
        currentRank = index + 1;
      }
    }
    standing.rank = currentRank;
  });

  return standings;
}

