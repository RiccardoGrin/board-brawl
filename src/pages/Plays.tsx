import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gamepad2, History } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { Button } from '../components/ui/button';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { PlaysFiltersBar } from '../components/plays';
import { GameSessionCard } from '../components/game/GameSessionCard';
import type { PlaysFilters, PlaysSort } from '../types/plays';
import type { GameSession } from '../types/tournament';

export default function PlaysPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const lastSuccessAt = useSyncStore((state) => state.lastSuccessAt);

  // Tournament store for game sessions
  const gameSessions = useTournamentStore((state) => state.gameSessions);
  const tournaments = useTournamentStore((state) => state.tournaments);

  // Local state
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [filters, setFilters] = useState<PlaysFilters>({});
  const [sort, setSort] = useState<PlaysSort>({ field: 'playedAt', direction: 'desc' });

  // Mark initial load as complete
  useEffect(() => {
    if (!initialized) return;

    if (!user) {
      setHasCompletedInitialLoad(true);
    } else if (lastSuccessAt !== null) {
      setHasCompletedInitialLoad(true);
    }
  }, [initialized, user, lastSuccessAt]);

  // Filter and sort sessions
  const { userSessions, filteredSessions } = useMemo(() => {
    if (!user) return { userSessions: [], filteredSessions: [] };

    // Get all completed sessions where the user participated
    const allUserSessions = Object.values(gameSessions)
      .filter((session): session is GameSession =>
        session.status === 'complete' &&
        session.participantUserIds?.includes(user.uid)
      );

    // Apply filters
    let filtered = [...allUserSessions];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(session =>
        session.gameName.toLowerCase().includes(searchLower)
      );
    }

    // Tournament filter
    if (filters.tournamentOnly) {
      filtered = filtered.filter(session => !!session.tournamentId);
    }

    // Casual filter
    if (filters.casualOnly) {
      filtered = filtered.filter(session => !session.tournamentId);
    }

    // Wins filter
    if (filters.winsOnly) {
      filtered = filtered.filter(session =>
        session.winnerUserIds?.includes(user.uid)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sort.field === 'playedAt') {
        const dateA = new Date(a.playedAt || a.createdAt).getTime();
        const dateB = new Date(b.playedAt || b.createdAt).getTime();
        return sort.direction === 'desc' ? dateB - dateA : dateA - dateB;
      } else if (sort.field === 'gameName') {
        const compare = a.gameName.localeCompare(b.gameName);
        return sort.direction === 'asc' ? compare : -compare;
      }
      return 0;
    });

    return { userSessions: allUserSessions, filteredSessions: filtered };
  }, [gameSessions, user, filters, sort]);

  const isLoading = !hasCompletedInitialLoad;

  const handleLogPlay = () => {
    navigate('/add-game');
  };

  const handleSessionClick = (session: GameSession) => {
    // Navigate to game detail page if gameId exists
    if (session.gameId) {
      navigate(`/games/${session.gameId}`);
    }
  };

  return (
    <div className="min-h-screen page-frame">
      <SEO
        path="/plays"
        title="Plays History | BoardBrawl"
        description="View your board game play history. Track your games, wins, and achievements."
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative">
          {/* Profile icon */}
          <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6 z-[60]">
            <AuthMenu />
          </div>

          <div className="flex justify-between items-start pr-12 sm:pr-14">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="-ml-2 text-muted h-10 w-10 shrink-0 rounded-[4px] hover:bg-gold-2/20 hover:text-ink"
                aria-label="Back to home"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              <div className="flex-1 min-w-0">
                <h1 className="flex items-center gap-3 text-4xl font-bold text-ink engraved tracking-tight leading-tight">
                  <History className="w-8 h-8 text-gold" aria-hidden="true" />
                  <span>Play History</span>
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="card-medieval p-12 text-center">
            <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4 animate-pulse" aria-hidden="true">
              <Gamepad2 className="w-5 h-5 text-gold-2" />
            </div>
            <h3 className="text-xl font-bold text-ink engraved mb-2">Loading plays...</h3>
            <p className="text-muted text-base">Please wait a moment.</p>
          </div>
        ) : userSessions.length === 0 ? (
          // No plays state
          <div className="card-medieval p-12 text-center">
            <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
              <Gamepad2 className="w-5 h-5 text-gold-2" />
            </div>
            <h3 className="text-xl font-bold text-ink engraved mb-2">No plays logged yet</h3>
            <p className="text-muted text-base mb-6">Start logging your game sessions to track your history.</p>
            <Button onClick={handleLogPlay} variant="primary">
              Log Your First Play
            </Button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-6">
              <PlaysFiltersBar
                filters={filters}
                sort={sort}
                onFiltersChange={setFilters}
                onSortChange={setSort}
                totalCount={userSessions.length}
                filteredCount={filteredSessions.length}
                onLogPlay={handleLogPlay}
              />
            </div>

            {/* Sessions List */}
            {filteredSessions.length === 0 ? (
              // No filter matches state
              <div className="card-medieval p-12 text-center">
                <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
                  <Gamepad2 className="w-5 h-5 text-gold-2" />
                </div>
                <h3 className="text-xl font-bold text-ink engraved mb-2">No plays match your filters</h3>
                <p className="text-muted text-base mb-6">Try adjusting your search or filter criteria.</p>
                <Button onClick={() => setFilters({})} variant="secondary">
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="space-y-4" role="list" aria-label="Play history">
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSessionClick(session)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSessionClick(session)}
                    role="listitem"
                    tabIndex={session.gameId ? 0 : -1}
                    className={session.gameId ? 'cursor-pointer' : ''}
                  >
                    <GameSessionCard
                      session={session}
                      tournamentName={session.tournamentId ? tournaments[session.tournamentId]?.name : undefined}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
