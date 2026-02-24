import { describe, it, expect } from 'vitest';
import { calculateLeaderboard } from './stats';
import type { Tournament, GameSession, Player } from '../types/tournament';

describe('calculateLeaderboard', () => {
  const mockPlayers: Player[] = [
    { id: 'p1', name: 'Alice', color: 'red' },
    { id: 'p2', name: 'Bob', color: 'blue' },
    { id: 'p3', name: 'Charlie', color: 'green' },
    { id: 'p4', name: 'Dana', color: 'yellow' },
  ];

  const mockTournament: Tournament = {
    id: 't1',
    name: 'Test Tournament',
    date: '2024-01-01',
    state: 'active',
    players: mockPlayers,
    gameSessions: ['g1', 'g2', 'g3'],
  };

  const mockFfaSession: GameSession = {
    id: 'g1',
    ownerId: 'user1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    playedAt: '2024-01-01T00:00:00Z',
    tournamentId: 't1',
    gameName: 'FFA Game',
    status: 'complete',
    preset: 'medium',
    scoringRules: { first: 5, second: 3, third: 1, others: 0 },
    participantUserIds: [],
    winnerUserIds: [],
    participants: [
      { playerId: 'p1', name: 'Alice' },
      { playerId: 'p2', name: 'Bob' },
      { playerId: 'p3', name: 'Charlie' },
    ],
    results: {
      mode: 'freeForAll',
      placements: [
        { rank: 1, playerIds: ['p1'], points: 5 },
        { rank: 2, playerIds: ['p2'], points: 3 },
        { rank: 3, playerIds: ['p3'], points: 1 },
      ],
    },
  };

  const mockTeamSession: GameSession = {
    id: 'g3',
    ownerId: 'user1',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    playedAt: '2024-01-03T00:00:00Z',
    tournamentId: 't1',
    gameName: 'Team Game',
    status: 'complete',
    preset: 'big',
    scoringRules: { first: 8, second: 5, third: 2, others: 0 },
    participantUserIds: [],
    winnerUserIds: [],
    participants: [
      { playerId: 'p1', name: 'Alice', teamId: 'A' },
      { playerId: 'p4', name: 'Dana', teamId: 'A' },
      { playerId: 'p2', name: 'Bob', teamId: 'B' },
      { playerId: 'p3', name: 'Charlie', teamId: 'B' },
    ],
    results: {
      mode: 'teams',
      placements: [
        { rank: 1, playerIds: ['p1'], points: 8 },
        { rank: 2, playerIds: ['p4'], points: 8 },
        { rank: 3, playerIds: ['p2'], points: 5 },
        { rank: 4, playerIds: ['p3'], points: 5 },
      ],
    },
  };

  it('calculates total points correctly for FFA games', () => {
    const stats = calculateLeaderboard(mockTournament, [mockFfaSession]);
    const alice = stats.find(s => s.playerId === 'p1');
    const bob = stats.find(s => s.playerId === 'p2');
    const charlie = stats.find(s => s.playerId === 'p3');
    expect(alice?.totalPoints).toBe(5);
    expect(bob?.totalPoints).toBe(3);
    expect(charlie?.totalPoints).toBe(1);
  });

  it('calculates total points correctly including team games', () => {
    const stats = calculateLeaderboard(mockTournament, [mockFfaSession, mockTeamSession]);
    // Alice: 5 (FFA) + 8 (Team) = 13
    // Bob: 3 (FFA) + 5 (Team) = 8
    // Charlie: 1 (FFA) + 5 (Team) = 6
    // Dana: 8 (Team) = 8
    const alice = stats.find(s => s.playerId === 'p1');
    const bob = stats.find(s => s.playerId === 'p2');
    const charlie = stats.find(s => s.playerId === 'p3');
    const dana = stats.find(s => s.playerId === 'p4');

    expect(alice?.totalPoints).toBe(13);
    expect(bob?.totalPoints).toBe(8);
    expect(charlie?.totalPoints).toBe(6);
    expect(dana?.totalPoints).toBe(8);
  });
  
  it('calculates average points correctly', () => {
    const stats = calculateLeaderboard(mockTournament, [mockFfaSession, mockTeamSession]);
    const alice = stats.find(s => s.playerId === 'p1'); // 13 / 2 games = 6.5
    const bob = stats.find(s => s.playerId === 'p2');   // 8 / 2 games = 4
    expect(alice?.averagePoints).toBe(6.5);
    expect(bob?.averagePoints).toBe(4);
  });

  it('sorts by total points descending by default', () => {
    const stats = calculateLeaderboard(mockTournament, [mockFfaSession, mockTeamSession]);
    expect(stats[0].playerId).toBe('p1'); // 13 pts
    expect(stats[1].playerId).toBe('p2'); // 8 pts
    expect(stats[2].playerId).toBe('p4'); // 8 pts
    expect(stats[3].playerId).toBe('p3'); // 6 pts
  });

  it('passes teamId through to the results history', () => {
    const stats = calculateLeaderboard(mockTournament, [mockTeamSession]);
    const alice = stats.find(s => s.playerId === 'p1');
    expect(alice?.results[0].teamId).toBe('A');
  });

  it('handles players with no games', () => {
    const playersWithGhost = [...mockPlayers, { id: 'p5', name: 'Ghost', color: 'gray' }];
    const tournamentWithGhost = { ...mockTournament, players: playersWithGhost };
    const stats = calculateLeaderboard(tournamentWithGhost, [mockFfaSession]);
    const ghost = stats.find(s => s.playerId === 'p5');
    expect(ghost?.totalPoints).toBe(0);
    expect(ghost?.gamesPlayed).toBe(0);
    expect(ghost?.averagePoints).toBe(0);
  });
});
