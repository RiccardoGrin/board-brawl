import { describe, it, expect, beforeEach } from 'vitest';
import { useTournamentStore } from '../store/tournamentStore';

describe('tournamentStore', () => {
  beforeEach(() => {
    localStorage.removeItem('tournament-storage');
    useTournamentStore.setState({
      activeTournamentId: null,
      tournaments: {},
      gameSessions: {}
    });
  });

  it('creates a tournament', () => {
    const store = useTournamentStore.getState();
    store.createTournament('My Tournament', 'Description', [{ name: 'Alice' }, { name: 'Bob' }]);

    const newState = useTournamentStore.getState();
    expect(newState.activeTournamentId).not.toBeNull();
    
    if (newState.activeTournamentId) {
      const tournament = newState.tournaments[newState.activeTournamentId];
      expect(tournament.name).toBe('My Tournament');
      expect(tournament.players).toHaveLength(2);
      expect(tournament.players[0].name).toBe('Alice');
      // Should assign default colors
      expect(tournament.players[0].color).toBeDefined();
    }
  });

  it('adds a player to an active tournament', () => {
    const store = useTournamentStore.getState();
    store.createTournament('Test Cup', undefined, [{ name: 'P1' }, { name: 'P2' }]);
    
    const tournamentId = useTournamentStore.getState().activeTournamentId!;
    store.addPlayer(tournamentId, 'P3');

    const tournament = useTournamentStore.getState().tournaments[tournamentId];
    expect(tournament.players).toHaveLength(3);
    expect(tournament.players[2].name).toBe('P3');
  });

  it('prevents removing a player who has played games', () => {
    const tournamentId = 't1';
    const p1Id = 'p1';
    const p2Id = 'p2';
    useTournamentStore.setState({
      activeTournamentId: tournamentId,
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: 'Test Cup',
          description: undefined,
          date: new Date().toISOString(),
          state: 'active',
          players: [
            { id: p1Id, name: 'P1' },
            { id: p2Id, name: 'P2' },
          ],
          gameSessions: ['session1'],
        },
      },
      gameSessions: {
        session1: {
          id: 'session1',
          ownerId: 'user1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          playedAt: new Date().toISOString(),
          tournamentId,
          gameName: 'Uno',
          status: 'complete',
          preset: 'quick',
          scoringRules: { first: 1, second: 0, third: 0, others: 0 },
          participantUserIds: [],
          winnerUserIds: [],
          participants: [
            { playerId: p1Id, name: 'P1' },
            { playerId: p2Id, name: 'P2' },
          ],
          results: { mode: 'freeForAll', placements: [] },
        },
      },
    });

    const store = useTournamentStore.getState();
    store.removePlayer(tournamentId, p1Id);

    const tournamentAfter = useTournamentStore.getState().tournaments[tournamentId];
    expect(tournamentAfter.players.find(p => p.id === p1Id)).toBeDefined();
  });

  it('removes a player who has NOT played games', () => {
    const tournamentId = 't2';
    const p1Id = 'p3';
    useTournamentStore.setState({
      activeTournamentId: tournamentId,
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: 'Test Cup',
          description: undefined,
          date: new Date().toISOString(),
          state: 'active',
          players: [
            { id: p1Id, name: 'P1' },
            { id: 'p4', name: 'P2' },
          ],
          gameSessions: [],
        },
      },
      gameSessions: {},
    });

    const store = useTournamentStore.getState();
    store.removePlayer(tournamentId, p1Id);

    const tournamentAfter = useTournamentStore.getState().tournaments[tournamentId];
    expect(tournamentAfter.players).toHaveLength(1);
    expect(tournamentAfter.players.find(p => p.id === p1Id)).toBeUndefined();
  });

  it('updates player details', () => {
    const tournamentId = 't3';
    const p1Id = 'p5';
    useTournamentStore.setState({
      activeTournamentId: tournamentId,
      tournaments: {
        [tournamentId]: {
          id: tournamentId,
          name: 'Test Cup',
          description: undefined,
          date: new Date().toISOString(),
          state: 'active',
          players: [{ id: p1Id, name: 'P1' }],
          gameSessions: [],
        },
      },
      gameSessions: {},
    });

    const store = useTournamentStore.getState();
    store.updatePlayer(tournamentId, p1Id, { name: 'Player One', color: '#123456' });

    const player = useTournamentStore.getState().tournaments[tournamentId].players[0];
    expect(player.name).toBe('Player One');
    expect(player.color).toBe('#123456');
  });

  it('stores bracket game id and metadata when provided', () => {
    const store = useTournamentStore.getState();
    store.createTournament(
      'Bracket Test',
      'Desc',
      [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
      ],
      'bracket',
      'Catan',
      {
        gameId: 'game-123',
        gameSourceIds: { bgg: '456' },
        gameMeta: { minPlayers: 2, maxPlayers: 4 },
      }
    );

    const newState = useTournamentStore.getState();
    const tournamentId = newState.activeTournamentId!;
    const bracketConfig = newState.tournaments[tournamentId].bracketConfig;
    expect(bracketConfig?.gameId).toBe('game-123');
    expect(bracketConfig?.gameSourceIds?.bgg).toBe('456');
    expect(bracketConfig?.gameMeta?.minPlayers).toBe(2);
    expect(bracketConfig?.gameTitle).toBe('Catan');
  });

  describe('Player Linking (userId)', () => {
    it('adds a linked player and updates memberIds', () => {
      const store = useTournamentStore.getState();
      store.createTournament('Test Cup', undefined, [{ name: 'P1' }]);
      
      const tournamentId = useTournamentStore.getState().activeTournamentId!;
      const userId = 'user123';
      
      // Add linked player
      store.addPlayer(tournamentId, 'Linked Player', '#ff0000', userId);
      
      const tournament = useTournamentStore.getState().tournaments[tournamentId];
      expect(tournament.players).toHaveLength(2);
      expect(tournament.players[1].userId).toBe(userId);
      expect(tournament.memberIds).toContain(userId);
      expect(tournament.memberRoles?.[userId]).toBe('viewer');
    });

    it('updates player userId and manages memberIds correctly', () => {
      const tournamentId = 't4';
      const playerId = 'p1';
      const oldUserId = 'user1';
      const newUserId = 'user2';
      
      useTournamentStore.setState({
        activeTournamentId: tournamentId,
        tournaments: {
          [tournamentId]: {
            id: tournamentId,
            name: 'Test Cup',
            description: undefined,
            date: new Date().toISOString(),
            state: 'active',
            players: [{ id: playerId, name: 'P1', userId: oldUserId }],
            gameSessions: [],
            ownerId: 'owner1',
            memberIds: ['owner1', oldUserId],
            memberRoles: { owner1: 'owner', [oldUserId]: 'viewer' },
          },
        },
        gameSessions: {},
      });

      const store = useTournamentStore.getState();
      store.updatePlayer(tournamentId, playerId, { userId: newUserId });

      const tournament = useTournamentStore.getState().tournaments[tournamentId];
      expect(tournament.players[0].userId).toBe(newUserId);
      expect(tournament.memberIds).not.toContain(oldUserId);
      expect(tournament.memberIds).toContain(newUserId);
      expect(tournament.memberRoles?.[newUserId]).toBe('viewer');
      expect(tournament.memberRoles?.[oldUserId]).toBeUndefined();
    });

    it('prevents duplicate userId in same tournament', () => {
      const tournamentId = 't5';
      const p1Id = 'p1';
      const p2Id = 'p2';
      const duplicateUserId = 'user999';
      
      useTournamentStore.setState({
        activeTournamentId: tournamentId,
        tournaments: {
          [tournamentId]: {
            id: tournamentId,
            name: 'Test Cup',
            description: undefined,
            date: new Date().toISOString(),
            state: 'active',
            players: [
              { id: p1Id, name: 'P1', userId: duplicateUserId },
              { id: p2Id, name: 'P2' },
            ],
            gameSessions: [],
            memberIds: [duplicateUserId],
            memberRoles: { [duplicateUserId]: 'viewer' },
          },
        },
        gameSessions: {},
      });

      const store = useTournamentStore.getState();
      // Try to link the same userId to a different player
      store.updatePlayer(tournamentId, p2Id, { userId: duplicateUserId });

      const tournament = useTournamentStore.getState().tournaments[tournamentId];
      // Should NOT have updated (duplicate prevention)
      expect(tournament.players[1].userId).toBeUndefined();
    });

    it('removes linked player and cleans up memberIds', () => {
      const tournamentId = 't6';
      const playerId = 'p1';
      const userId = 'user456';
      
      useTournamentStore.setState({
        activeTournamentId: tournamentId,
        tournaments: {
          [tournamentId]: {
            id: tournamentId,
            name: 'Test Cup',
            description: undefined,
            date: new Date().toISOString(),
            state: 'active',
            players: [
              { id: playerId, name: 'Linked Player', userId: userId },
              { id: 'p2', name: 'P2' },
            ],
            gameSessions: [],
            ownerId: 'owner1',
            memberIds: ['owner1', userId],
            memberRoles: { owner1: 'owner', [userId]: 'viewer' },
          },
        },
        gameSessions: {},
      });

      const store = useTournamentStore.getState();
      store.removePlayer(tournamentId, playerId);

      const tournament = useTournamentStore.getState().tournaments[tournamentId];
      expect(tournament.players).toHaveLength(1);
      expect(tournament.memberIds).not.toContain(userId);
      expect(tournament.memberRoles?.[userId]).toBeUndefined();
    });

    it('does not remove owner from memberIds when unlinking', () => {
      const tournamentId = 't7';
      const playerId = 'p1';
      const ownerId = 'owner1';
      
      useTournamentStore.setState({
        activeTournamentId: tournamentId,
        tournaments: {
          [tournamentId]: {
            id: tournamentId,
            name: 'Test Cup',
            description: undefined,
            date: new Date().toISOString(),
            state: 'active',
            players: [
              { id: playerId, name: 'Owner Player', userId: ownerId },
              { id: 'p2', name: 'P2' },
            ],
            gameSessions: [],
            ownerId: ownerId,
            memberIds: [ownerId],
            memberRoles: { [ownerId]: 'owner' },
          },
        },
        gameSessions: {},
      });

      const store = useTournamentStore.getState();
      // Try to remove the owner's player
      store.removePlayer(tournamentId, playerId);

      const tournament = useTournamentStore.getState().tournaments[tournamentId];
      expect(tournament.players).toHaveLength(1);
      // Owner should still be in memberIds
      expect(tournament.memberIds).toContain(ownerId);
      expect(tournament.memberRoles?.[ownerId]).toBe('owner');
    });
  });
});
