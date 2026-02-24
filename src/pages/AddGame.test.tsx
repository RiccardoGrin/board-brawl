import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AddGame from './AddGame';
import { useTournamentStore } from '../store/tournamentStore';
import { type Tournament } from '../types/tournament';

// Mock child components
vi.mock('../components/ui/team-icon-selector', () => ({
  TeamIconSelector: ({ value, onChange }: { value?: string, onChange: (v: string) => void }) => (
    <button data-testid="team-icon-selector" onClick={() => onChange('dices')}>
      {value || 'Pick icon'}
    </button>
  ),
  TeamIconBadge: ({ value }: { value?: string }) => <span>{value}</span>,
}));

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

// Mock store
const addGameSessionMock = vi.fn();
const mockTournament: Tournament = {
  id: 't1',
  name: 'Test Tournament',
  state: 'active',
  date: '2024-01-01',
  players: [
    { id: 'p1', name: 'Alice', color: 'red' },
    { id: 'p2', name: 'Bob', color: 'blue' },
  ],
  gameSessions: [],
};

describe('AddGame Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTournamentStore.setState({
      activeTournamentId: 't1',
      tournaments: { t1: mockTournament },
      gameSessions: {},
      addGameSession: addGameSessionMock,
      getTournament: () => mockTournament,
      getTournamentSessions: () => [],
    });
  });

  const renderComponent = () => {
    render(
      <MemoryRouter initialEntries={['/add-game']}>
        <Routes>
          <Route path="/add-game" element={<AddGame />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('progresses through the wizard for an FFA game', async () => {
    renderComponent();
    
    // Step 1: Fill game details
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Game Name/i), { target: { value: 'Catan' } });
      fireEvent.click(screen.getByRole('button', { name: /Next: Players/i }));
    });

    // Step 2: Select players
    await waitFor(() => {
      expect(screen.getByText(/Choose the players who played this game./i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Alice'));
      fireEvent.click(screen.getByText('Bob'));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Next: Game Results/i }));
    });

    // Step 3: Record results and save
    await waitFor(() => {
      expect(screen.getByText(/Drag to order/i)).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Game/i }));
    });

    expect(addGameSessionMock).toHaveBeenCalledOnce();
    expect(mockedNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error if team icons are not assigned in team mode', async () => {
    renderComponent();
    
    // Step 1: Set to team mode
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Game Name/i), { target: { value: 'Catan' } }); // Added missing game name
      fireEvent.click(screen.getByText('Teams'));
      fireEvent.click(screen.getByRole('button', { name: /Next: Players/i }));
    });

    // Step 2: Select players but do not assign teams
    await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Alice'));
      fireEvent.click(screen.getByText('Bob'));
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Next: Game Results/i }));
    });

    // Assert error message is shown
    expect(await screen.findByText(/Please assign a team icon/i)).toBeInTheDocument();
    expect(addGameSessionMock).not.toHaveBeenCalled();
  });
});
