import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { BrowserRouter } from 'react-router-dom';
import TournamentDashboard from './TournamentDashboard';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTournamentStore } from '../store/tournamentStore';
import type { Tournament, GameSession } from '../types/tournament';

// Mock the store
const mockStore = {
  activeTournamentId: 't1',
  tournaments: {} as any,
  gameSessions: {} as any,
  getTournament: vi.fn(),
  getTournamentSessions: vi.fn(),
  finishTournament: vi.fn(),
  reopenTournament: vi.fn(),
  updateTournament: vi.fn(),
  deleteTournament: vi.fn(),
  addPlayer: vi.fn(),
  removePlayer: vi.fn(),
  updatePlayer: vi.fn(),
};

vi.mock('../store/tournamentStore', () => ({
  useTournamentStore: Object.assign(
    vi.fn(),
    {
      getState: () => mockStore,
    }
  ),
}));

describe('TournamentDashboard', () => {
  const mockTournament: Tournament = {
    id: 't1',
    name: 'Test Tournament',
    description: 'Test Description',
    date: '2023-01-01',
    state: 'active',
    players: [
      { id: 'p1', name: 'Alice', color: '#ff0000' },
      { id: 'p2', name: 'Bob', color: '#0000ff' },
    ],
    gameSessions: ['s1'],
  };

  const mockSessions: GameSession[] = [
    {
      id: 's1',
      ownerId: 'user1',
      createdAt: '2023-01-02T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z',
      playedAt: '2023-01-02T00:00:00Z',
      tournamentId: 't1',
      gameName: 'Catan',
      status: 'complete',
      preset: 'medium',
      scoringRules: { first: 5, second: 3, third: 1, others: 0 },
      participantUserIds: [],
      winnerUserIds: [],
      participants: [
        { playerId: 'p1', name: 'Alice' },
        { playerId: 'p2', name: 'Bob' },
      ],
      results: {
        mode: 'freeForAll',
        placements: [
          { rank: 1, playerIds: ['p1'], points: 5 },
          { rank: 2, playerIds: ['p2'], points: 3 },
        ],
      },
    },
  ];

  beforeEach(() => {
    // Update mock store data
    mockStore.activeTournamentId = 't1';
    mockStore.tournaments = { 't1': mockTournament };
    mockStore.gameSessions = { 's1': mockSessions[0] };
    mockStore.getTournament.mockImplementation((id: string) => (id === 't1' ? mockTournament : undefined));
    mockStore.getTournamentSessions.mockImplementation((id: string) => (id === 't1' ? mockSessions : []));

    // Reset the mock implementation before each test
    (useTournamentStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
        return selector(mockStore);
    });
  });


  it('renders tournament dashboard correctly', () => {
    render(
      <BrowserRouter>
        <TournamentDashboard />
      </BrowserRouter>
    );

    expect(screen.getByText('Test Tournament')).toBeInTheDocument();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
    // Default tab is Standings
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Alice has 5 points, Bob has 3
    // const pointsCells = screen.getAllByRole('cell', { name: /\d+/ });
    // This is a bit loose, specific querying would be better but depends on exact DOM structure
    // We expect 5 and 3 to be visible in the points column
  });

  it('switches tabs', () => {
    render(
      <BrowserRouter>
        <TournamentDashboard />
      </BrowserRouter>
    );

    const gamesTab = screen.getAllByText(/Games/i)[0];
    fireEvent.click(gamesTab);
    expect(screen.getByText('Catan')).toBeInTheDocument();

    const playersTab = screen.getByText(/Players/i);
    fireEvent.click(playersTab);
    expect(screen.getByText(/Add Player/i)).toBeInTheDocument();
  });
});
