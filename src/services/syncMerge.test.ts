import { describe, expect, it } from 'vitest';
import { mergeSnapshots, toEpoch } from './syncMerge';

describe('toEpoch', () => {
  it('returns 0 for falsy or invalid strings', () => {
    expect(toEpoch(undefined)).toBe(0);
    expect(toEpoch('not a date')).toBe(0);
  });

  it('parses valid dates', () => {
    expect(toEpoch('2024-01-01T00:00:00.000Z')).toBeGreaterThan(0);
  });
});

describe('mergeSnapshots', () => {
  const baseTournament = {
    id: 't1',
    name: 'T',
    description: '',
    date: '2024-01-01T00:00:00.000Z',
    state: 'active' as const,
    players: [],
    gameSessions: [],
  };

  const session = {
    id: 's1',
    ownerId: 'user1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    playedAt: '2024-01-01T00:00:00.000Z',
    tournamentId: 't1',
    gameName: 'Game',
    status: 'complete' as const,
    preset: 'medium' as const,
    scoringRules: { first: 5, second: 3, third: 1, others: 0 },
    participantUserIds: [] as string[],
    winnerUserIds: [] as string[],
    participants: [] as { playerId: string; name: string }[],
    results: { mode: 'freeForAll' as const, placements: [] },
  };

  it('prefers newer tournaments', () => {
    const local = {
      tournaments: {
        t1: { ...baseTournament, name: 'Local', updatedAt: '2024-02-01T00:00:00.000Z', gameSessions: [] },
      },
      gameSessions: {},
    };
    const remote = {
      tournaments: {
        t1: { ...baseTournament, name: 'Remote', updatedAt: '2024-01-01T00:00:00.000Z', gameSessions: [] },
      },
      gameSessions: {},
    };
    const merged = mergeSnapshots(local, remote);
    expect(merged.tournaments.t1.name).toBe('Local');
  });

  it('adds missing sessions to tournament lists', () => {
    const local = {
      tournaments: {
        t1: { ...baseTournament, gameSessions: ['s1'], updatedAt: '2024-02-01T00:00:00.000Z' },
      },
      gameSessions: {
        s1: { ...session, updatedAt: '2024-02-01T00:00:00.000Z' },
      },
    };
    const remote = {
      tournaments: {
        t1: { ...baseTournament, gameSessions: [], updatedAt: '2024-01-01T00:00:00.000Z' },
      },
      gameSessions: {},
    };

    const merged = mergeSnapshots(local, remote);
    expect(merged.tournaments.t1.gameSessions).toContain('s1');
    expect(merged.gameSessions.s1).toBeDefined();
  });
});


