import { render } from '@testing-library/react';
import { screen, fireEvent, waitFor } from '@testing-library/dom';
import { BrowserRouter } from 'react-router-dom';
import NewTournament from './NewTournament';
import { describe, it, expect } from 'vitest';

// Mock the store
// import { useTournamentStore } from '../store/tournamentStore';

// We need to mock the store implementation for testing
// This is a basic example, you might need a more robust mock setup
// const initialStoreState = useTournamentStore.getState();

describe('NewTournament', () => {
  it('renders step 1 with format selection', () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    expect(screen.getByText('Tournament Format')).toBeInTheDocument();
    expect(screen.getByText('Multi-Game Tournament')).toBeInTheDocument();
    expect(screen.getByText('Single-Elimination Bracket')).toBeInTheDocument();
  });

  it('navigates to step 2 when format is selected', async () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    const multiGameButton = screen.getByText('Multi-Game Tournament').closest('button');
    expect(multiGameButton).toBeInTheDocument();
    fireEvent.click(multiGameButton!);

    await waitFor(() => {
      expect(screen.getByText('Tournament Details')).toBeInTheDocument();
      expect(screen.getByLabelText(/Tournament Name/i)).toBeInTheDocument();
    });
  });

  it('navigates to step 3 and allows adding/removing players', async () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    // Step 1: Select format
    const multiGameButton = screen.getByText('Multi-Game Tournament').closest('button');
    fireEvent.click(multiGameButton!);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tournament Name/i)).toBeInTheDocument();
    });

    // Step 2: Fill in tournament details
    const nameInput = screen.getByLabelText(/Tournament Name/i);
    fireEvent.change(nameInput, { target: { value: 'Test Tournament' } });

    const nextButton = screen.getByText(/Next/i);
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Add Players')).toBeInTheDocument();
    });

    // Step 3: Player management
    expect(screen.getAllByPlaceholderText(/Player Name/i)).toHaveLength(2);

    const addButton = screen.getByText(/New Player/i);
    fireEvent.click(addButton);

    expect(screen.getAllByPlaceholderText(/Player Name/i)).toHaveLength(3);

    // Remove a player
    const removeButtons = screen.getAllByLabelText(/Remove player/i);
    expect(removeButtons.length).toBeGreaterThan(0);
    
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByPlaceholderText(/Player Name/i)).toHaveLength(2);
  });

  it('shows validation errors on step 2', async () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    // Step 1: Select format
    const multiGameButton = screen.getByText('Multi-Game Tournament').closest('button');
    fireEvent.click(multiGameButton!);

    await waitFor(() => {
      expect(screen.getByText('Tournament Details')).toBeInTheDocument();
    });

    // Try to proceed without entering a name
    const nextButton = screen.getByText(/Next/i);
    fireEvent.click(nextButton);

    // Check for validation messages
    expect(await screen.findByText('Tournament name must be at least 3 characters')).toBeInTheDocument();
  });

  it('allows navigation back through steps', async () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    // Step 1: Select format
    const multiGameButton = screen.getByText('Multi-Game Tournament').closest('button');
    fireEvent.click(multiGameButton!);

    await waitFor(() => {
      expect(screen.getByText('Tournament Details')).toBeInTheDocument();
    });

    // Go back to step 1
    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText('Tournament Format')).toBeInTheDocument();
    });
  });

  it('shows game name field for bracket format', async () => {
    render(
      <BrowserRouter>
        <NewTournament />
      </BrowserRouter>
    );

    // Step 1: Select bracket format
    const bracketButton = screen.getByText('Single-Elimination Bracket').closest('button');
    fireEvent.click(bracketButton!);

    await waitFor(() => {
      expect(screen.getByText('Tournament Details')).toBeInTheDocument();
      expect(screen.getByLabelText(/Game Name/i)).toBeInTheDocument();
    });
  });
});
