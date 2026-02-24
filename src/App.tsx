import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTournamentStore } from './store/tournamentStore';
import { useLibraryStore } from './store/libraryStore';
import { useAuthStore } from './store/authStore';
import { useSyncStore } from './store/syncStore';
import { useNotificationStore } from './store/notificationStore';
import { useStatsStore } from './store/statsStore';
import { Button } from './components/ui/button';
import { Modal } from './components/ui/modal';
import { Input, Textarea } from './components/ui/input';
import { Plus, Trophy, Calendar, CheckCircle, Users, Gamepad2, Trash2, RotateCcw, Share2, BookOpen, Edit2, Lock, Globe, Link as LinkIcon, LayoutDashboard, Award, Package, PackageOpen, Star, History } from 'lucide-react';
import { SEO } from './components/SEO';
import logoSvg from '/favicon.svg?url';
import logoPngFallback from '/favicon-64x64.png?url';
import { AuthMenu } from './components/AuthMenu';
import { SharedTournamentCard } from './components/SharedTournamentCard';
import { PlaysFiltersBar } from './components/plays';
import { GameSessionCard } from './components/game/GameSessionCard';
import type { Tournament, GameSession } from './types/tournament';
import type { LibraryVisibility } from './types/library';
import type { PlaysFilters, PlaysSort } from './types/plays';
import { cn } from './utils/cn';
import { DropdownMenu } from './components/ui/dropdown-menu';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab from URL
  const activeTab = useMemo(() => {
    if (location.pathname === '/tournaments') return 'tournaments';
    if (location.pathname.startsWith('/library')) return 'library';
    if (location.pathname === '/plays') return 'plays';
    return 'dashboard';
  }, [location.pathname]);
  
  // Tournament state
  const tournaments = useTournamentStore(state => state.tournaments);
  const finishTournament = useTournamentStore(state => state.finishTournament);
  const reopenTournament = useTournamentStore(state => state.reopenTournament);
  
  // Library state
  const libraries = useLibraryStore(state => state.libraries);
  const memberships = useLibraryStore(state => state.memberships);
  const lastVisitedLibraryId = useLibraryStore(state => state.lastVisitedLibraryId);
  const createLibrary = useLibraryStore(state => state.createLibrary);
  const updateLibrary = useLibraryStore(state => state.updateLibrary);
  const deleteLibrary = useLibraryStore(state => state.deleteLibrary);
  const getMyLibrary = useLibraryStore(state => state.getMyLibrary);
  
  // Auth & sync
  const user = useAuthStore(state => state.user);
  const userProfile = useAuthStore(state => state.userProfile);
  const initialized = useAuthStore(state => state.initialized);
  const lastSuccessAt = useSyncStore(state => state.lastSuccessAt);
  const showNotification = useNotificationStore(state => state.show);

  // Stats
  const stats = useStatsStore(state => state.stats);
  const statsLoading = useStatsStore(state => state.loading);

  // Plays state
  const gameSessions = useTournamentStore(state => state.gameSessions);
  const [playsFilters, setPlaysFilters] = useState<PlaysFilters>({});
  const [playsSort, setPlaysSort] = useState<PlaysSort>({ field: 'playedAt', direction: 'desc' });

  // Track if we've completed initial load to prevent flash of empty state
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);

  
  // Tournament state
  const [isEndTournamentModalOpen, setIsEndTournamentModalOpen] = useState(false);
  const [tournamentToEnd, setTournamentToEnd] = useState<string | null>(null);
  const [isReopenTournamentModalOpen, setIsReopenTournamentModalOpen] = useState(false);
  const [tournamentToReopen, setTournamentToReopen] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tournamentToDelete, setTournamentToDelete] = useState<string | null>(null);
  
  // Library state
  const [isCreateLibraryModalOpen, setIsCreateLibraryModalOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryDescription, setNewLibraryDescription] = useState('');
  const [newLibraryVisibility, setNewLibraryVisibility] = useState<LibraryVisibility>('public');
  const [deleteLibraryConfirmId, setDeleteLibraryConfirmId] = useState<string | null>(null);
  
  const NAME_MAX = 50;
  const DESCRIPTION_MAX = 200;

  // Split tournaments into owned (yours) and shared (others')
  const { ownedTournaments, sharedTournaments } = useMemo(() => {
    const allTournaments = Object.values(tournaments).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    const owned = allTournaments.filter(t => 
      // Owner, or no owner set (legacy/local tournaments)
      !t.ownerId || t.ownerId === user?.uid
    );
    
    const shared = allTournaments.filter(t => 
      // Has an owner that isn't the current user
      t.ownerId && t.ownerId !== user?.uid
    );
    
    return { ownedTournaments: owned, sharedTournaments: shared };
  }, [tournaments, user?.uid]);

  // Active tournaments for dashboard (owned + active state)
  const activeTournaments = useMemo(() => {
    return ownedTournaments.filter(t => t.state === 'active').slice(0, 5);
  }, [ownedTournaments]);

  // Filter and sort play sessions
  const { userSessions, filteredSessions } = useMemo(() => {
    if (!user) return { userSessions: [], filteredSessions: [] };

    const allUserSessions = Object.values(gameSessions)
      .filter((session): session is GameSession =>
        session.status === 'complete' &&
        session.participantUserIds?.includes(user.uid)
      );

    let filtered = [...allUserSessions];

    if (playsFilters.search) {
      const searchLower = playsFilters.search.toLowerCase();
      filtered = filtered.filter(session =>
        session.gameName.toLowerCase().includes(searchLower)
      );
    }
    if (playsFilters.tournamentOnly) {
      filtered = filtered.filter(session => !!session.tournamentId);
    }
    if (playsFilters.casualOnly) {
      filtered = filtered.filter(session => !session.tournamentId);
    }
    if (playsFilters.winsOnly) {
      filtered = filtered.filter(session =>
        session.winnerUserIds?.includes(user.uid)
      );
    }

    filtered.sort((a, b) => {
      if (playsSort.field === 'playedAt') {
        const dateA = new Date(a.playedAt || a.createdAt).getTime();
        const dateB = new Date(b.playedAt || b.createdAt).getTime();
        return playsSort.direction === 'desc' ? dateB - dateA : dateA - dateB;
      } else if (playsSort.field === 'gameName') {
        const compare = a.gameName.localeCompare(b.gameName);
        return playsSort.direction === 'asc' ? compare : -compare;
      }
      return 0;
    });

    return { userSessions: allUserSessions, filteredSessions: filtered };
  }, [gameSessions, user, playsFilters, playsSort]);

  // Mark initial load as complete once auth initializes and either:
  // 1. User is not logged in (guest mode) - show immediately
  // 2. User is logged in and first sync completes (lastSuccessAt becomes non-null)
  useEffect(() => {
    if (!initialized) return;
    
    if (!user) {
      // Guest mode - show immediately
      setHasCompletedInitialLoad(true);
    } else if (lastSuccessAt !== null) {
      // Logged in and first sync completed
      setHasCompletedInitialLoad(true);
    }
  }, [initialized, user, lastSuccessAt]);

  // Hide everything during initial load for logged-in users
  const isLoadingInitialData = !hasCompletedInitialLoad;

  const handleOpenTournament = (id: string) => {
    navigate(`/tournament/${id}`);
  };

  const handleLogPlay = () => {
    navigate('/add-game');
  };

  const handleSessionClick = (session: GameSession) => {
    if (session.gameId) {
      navigate(`/games/${session.gameId}`);
    }
  };


  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: '2-digit' 
    });
  };

  const confirmEndTournament = () => {
    if (tournamentToEnd) {
      finishTournament(tournamentToEnd);
    }
    setIsEndTournamentModalOpen(false);
    setTournamentToEnd(null);
  };

  const cancelEndTournament = () => {
    setIsEndTournamentModalOpen(false);
    setTournamentToEnd(null);
  };

  const confirmReopenTournament = () => {
    if (tournamentToReopen) {
      reopenTournament(tournamentToReopen);
    }
    setIsReopenTournamentModalOpen(false);
    setTournamentToReopen(null);
  };

  const cancelReopenTournament = () => {
    setIsReopenTournamentModalOpen(false);
    setTournamentToReopen(null);
  };

  const confirmDeleteTournament = () => {
    if (tournamentToDelete) {
      useTournamentStore.getState().deleteTournament(tournamentToDelete);
    }
    setIsDeleteModalOpen(false);
    setTournamentToDelete(null);
  };

  const cancelDeleteTournament = () => {
    setIsDeleteModalOpen(false);
    setTournamentToDelete(null);
  };

  const getGamesPlayedCount = (tournament: Tournament) => {
    if (tournament.format === 'bracket' && tournament.bracketConfig) {
      return tournament.bracketConfig.bracket.filter(match => match.isComplete).length;
    }
    return tournament.gameSessions.length;
  };
  
  // Library functions
  const libraryList = useMemo(() => {
    return Object.values(libraries).sort((a, b) => {
      // System libraries first (by sortOrder), then custom libraries by date
      const aSort = a.sortOrder ?? 100;
      const bSort = b.sortOrder ?? 100;
      if (aSort !== bSort) return aSort - bSort;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [libraries]);
  
  const getLibraryGameCount = (libraryId: string) => {
    const libraryMemberships = memberships[libraryId] || [];
    return libraryMemberships.length;
  };
  
  // Redirect /library to My Library when it exists
  useEffect(() => {
    // Only redirect when on the exact /library path (not /library/:id)
    // Handle both /library and /library/ (with trailing slash)
    const isLibraryRoot = location.pathname === '/library' || location.pathname === '/library/';
    
    if (isLibraryRoot && initialized && !isLoadingInitialData) {
      const myLibrary = getMyLibrary();
      
      if (myLibrary) {
        navigate(`/library/${myLibrary.id}`, { replace: true });
      }
    }
  }, [location.pathname, initialized, isLoadingInitialData, libraries, navigate, getMyLibrary]);
  
  const handleCreateLibrary = () => {
    if (!newLibraryName.trim()) return;

    const libraryId = createLibrary(newLibraryName.trim(), newLibraryVisibility);
    if (libraryId) {
      updateLibrary(libraryId, {
        description: newLibraryDescription.trim() || undefined,
      });
      
      setNewLibraryName('');
      setNewLibraryDescription('');
      setNewLibraryVisibility('public');
      setIsCreateLibraryModalOpen(false);
      
      navigate(`/library/${libraryId}`);
    }
  };
  
  const handleDeleteLibrary = () => {
    if (!deleteLibraryConfirmId) return;
    const library = libraries[deleteLibraryConfirmId];
    // Cannot delete system libraries
    if (library?.systemKey) return;
    
    deleteLibrary(deleteLibraryConfirmId);
    setDeleteLibraryConfirmId(null);
  };
  
  const handleCopyShareLink = async (libraryId: string) => {
    if (!userProfile?.userCode) return;
    
    const library = libraries[libraryId];
    if (!library || library.visibility !== 'public') return;
    
    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
    const shareUrl = `${siteUrl}/u/${userProfile.userCode}/library/${libraryId}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotification('success', 'Share link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy share link:', err);
      showNotification('error', 'Failed to copy link');
    }
  };
  
  /**
   * Smart navigation to Libraries tab.
   * Navigates directly to the most appropriate library:
   * 1. Last visited library (if it exists)
   * 2. My Library (if it exists)
   * 3. First available library
   * 4. Falls back to /library route (which will auto-redirect)
   */
  const handleNavigateToLibraries = () => {
    // Try last visited library first
    if (lastVisitedLibraryId && libraries[lastVisitedLibraryId]) {
      navigate(`/library/${lastVisitedLibraryId}`);
      return;
    }
    
    // Try My Library next
    const myLibrary = getMyLibrary();
    if (myLibrary) {
      navigate(`/library/${myLibrary.id}`);
      return;
    }
    
    // Try first available library
    const firstLibrary = libraryList[0];
    if (firstLibrary) {
      navigate(`/library/${firstLibrary.id}`);
      return;
    }
    
    // Fallback to /library route (existing redirect logic will handle it)
    navigate('/library');
  };

  return (
    <div className="min-h-screen page-frame">
      <SEO
        path={activeTab === 'library' ? '/library' : activeTab === 'tournaments' ? '/tournaments' : activeTab === 'plays' ? '/plays' : '/'}
        title={activeTab === 'library' ? 'My Libraries | BoardBrawl' : activeTab === 'tournaments' ? 'Tournaments | BoardBrawl' : activeTab === 'plays' ? 'Plays History | BoardBrawl' : 'Dashboard | BoardBrawl'}
        description={activeTab === 'library'
          ? 'Manage your board game library collections.'
          : activeTab === 'tournaments'
          ? 'Start, resume, or review your BoardBrawl tournaments with live leaderboards and customizable scoring.'
          : activeTab === 'plays'
          ? 'View your board game play history. Track your games, wins, and achievements.'
          : 'Track your board game stats, wins, and collection.'}
      />
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-0">
          <div className="flex items-center h-14">
            {/* Logo */}
            <button onClick={() => navigate('/')} className="flex items-center gap-2 shrink-0 mr-4 cursor-pointer" aria-label="BoardBrawl home">
              <div className="relative w-9 h-9 flex items-center justify-center">
                <img
                  src={logoSvg}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = logoPngFallback;
                  }}
                  alt=""
                  className="relative w-8 h-8 drop-shadow-sm"
                />
              </div>
              <span className="hidden sm:inline text-xl font-bold text-ink engraved tracking-wide">BoardBrawl</span>
            </button>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0" aria-label="Main navigation">
              {([
                { key: 'dashboard', label: 'Dashboard', mobileLabel: 'Stats', icon: LayoutDashboard, onClick: () => navigate('/') },
                { key: 'tournaments', label: 'Tournaments', mobileLabel: 'Tournaments', icon: Trophy, onClick: () => navigate('/tournaments') },
                { key: 'library', label: 'Libraries', mobileLabel: 'Library', icon: BookOpen, onClick: handleNavigateToLibraries },
                { key: 'plays', label: 'Plays', mobileLabel: 'Plays', icon: History, onClick: () => navigate('/plays') },
              ] as const).map(({ key, label, mobileLabel, icon: Icon, onClick }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className={cn(
                    "group h-14 px-1 text-sm font-bold engraved transition-all flex items-center gap-1.5 border-b-2",
                    activeTab === key
                      ? "border-gold text-gold"
                      : "border-transparent text-muted hover:text-ink hover:border-gold-2/50"
                  )}
                  aria-current={activeTab === key ? 'page' : undefined}
                >
                  <Icon className={cn("w-4 h-4 transition-colors", activeTab === key ? "text-gold" : "text-muted group-hover:text-ink")} aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className={cn("sm:hidden text-xs", activeTab !== key && "hidden")}>{mobileLabel}</span>
                </button>
              ))}
            </nav>

            {/* Auth Menu */}
            <div className="shrink-0 ml-2">
              <AuthMenu />
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" role="main" className="max-w-4xl mx-auto space-y-8 px-4 sm:px-0 pb-12 pt-8">
        {activeTab === 'dashboard' ? (
          <>
            {/* Dashboard Stats Section */}
            <section aria-labelledby="stats-heading">
              <h2 id="stats-heading" className="text-xl font-bold text-ink engraved mb-6">
                Your Stats
              </h2>

              {statsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="card-medieval p-6 text-center animate-pulse">
                      <div className="w-8 h-8 bg-gold-2/30 rounded-full mx-auto mb-2" />
                      <div className="h-8 w-12 bg-gold-2/20 mx-auto mb-1 rounded" />
                      <div className="h-4 w-16 bg-gold-2/10 mx-auto rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="card-medieval p-6 text-center">
                    <Gamepad2 className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-3xl font-bold text-ink engraved">{stats?.gamesPlayed ?? 0}</div>
                    <div className="text-sm text-muted engraved">Games Played</div>
                  </div>
                  <div className="card-medieval p-6 text-center">
                    <Trophy className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-3xl font-bold text-ink engraved">{stats?.gamesWon ?? 0}</div>
                    <div className="text-sm text-muted engraved">Games Won</div>
                  </div>
                  <div className="card-medieval p-6 text-center">
                    <Award className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-3xl font-bold text-ink engraved">{stats?.tournamentsPlayed ?? 0}</div>
                    <div className="text-sm text-muted engraved">Tournaments Played</div>
                  </div>
                  <div className="card-medieval p-6 text-center">
                    <Package className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-3xl font-bold text-ink engraved">{stats?.gamesOwned ?? 0}</div>
                    <div className="text-sm text-muted engraved">Games Owned</div>
                  </div>
                  <div className="card-medieval p-6 text-center">
                    <PackageOpen className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-3xl font-bold text-ink engraved">{stats?.unplayedGames ?? 0}</div>
                    <div className="text-sm text-muted engraved">Unplayed</div>
                  </div>
                  <div className="card-medieval p-6 text-center">
                    <Star className="w-8 h-8 text-gold mx-auto mb-2" aria-hidden="true" />
                    <div className="text-xl font-bold text-ink engraved truncate px-2">
                      {stats?.mostPlayedGameName || '—'}
                    </div>
                    <div className="text-sm text-muted engraved">Most Played</div>
                  </div>
                </div>
              )}
            </section>

            {/* Active Tournaments Section */}
            {user && activeTournaments.length > 0 && (
              <section aria-labelledby="active-tournaments-heading">
                <div className="flex justify-between items-center mb-6">
                  <h2 id="active-tournaments-heading" className="text-xl font-bold text-ink engraved">
                    Active Tournaments
                  </h2>
                  <Button onClick={() => navigate('/tournaments')} size="sm" variant="ghost">
                    View All
                  </Button>
                </div>
                <div className="grid gap-4 w-full" role="list">
                  {activeTournaments.map(tournament => (
                    <div
                      key={tournament.id}
                      onClick={() => handleOpenTournament(tournament.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleOpenTournament(tournament.id)}
                      role="listitem"
                      tabIndex={0}
                      className="card-medieval card-medieval-interactive p-6 cursor-pointer group w-full"
                      aria-label={`Open tournament: ${tournament.name}`}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-ink engraved group-hover:text-gold transition-colors truncate">
                          {tournament.name}
                        </h3>
                        <div className="flex items-center text-sm text-muted engraved gap-4 font-medium">
                          <span className="flex items-center shrink-0">
                            <Calendar className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                            {formatDate(tournament.date)}
                          </span>
                          <span className="flex items-center shrink-0">
                            <Users className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                            {tournament.players.length} players
                          </span>
                          <span className="flex items-center shrink-0">
                            <Gamepad2 className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                            {getGamesPlayedCount(tournament)} games
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : activeTab === 'tournaments' ? (
          <>
            {/* Your Tournaments Section */}
            <section aria-labelledby="tournaments-heading">
              <div className="flex justify-between items-center mb-6">
                <h2 id="tournaments-heading" className="text-xl font-bold text-ink engraved flex items-center gap-2">
                  Your Tournaments
                </h2>
                <Button onClick={() => navigate('/new')} size="sm" variant="secondary" aria-label="Create new tournament">
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span className="hidden sm:inline">New Tournament</span>
                  <span className="sm:hidden">Tournament</span>
                </Button>
              </div>

          {isLoadingInitialData ? (
            <div className="card-medieval p-12 text-center">
              <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4 animate-pulse" aria-hidden="true">
                <Trophy className="w-5 h-5 text-gold-2" />
              </div>
              <h3 className="text-xl font-bold text-ink engraved mb-2">Loading tournaments...</h3>
              <p className="text-muted text-base">Please wait a moment.</p>
            </div>
          ) : ownedTournaments.length === 0 ? (
            <div className="card-medieval p-12 text-center">
              <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
                <Trophy className="w-5 h-5 text-gold-2" />
              </div>
              <h3 className="text-xl font-bold text-ink engraved mb-2">No tournaments yet</h3>
              <p className="text-muted text-base mb-6">Your legend begins with the first scroll.</p>
              <Button onClick={() => navigate('/new')} variant="primary">
                Create First Tournament
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 w-full" role="list">
              {ownedTournaments.map(tournament => (
                <div 
                  key={tournament.id}
                  onClick={() => handleOpenTournament(tournament.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOpenTournament(tournament.id)}
                  role="listitem"
                  tabIndex={0}
                  className="card-medieval card-medieval-interactive p-6 cursor-pointer group w-full relative"
                  aria-label={`Open tournament: ${tournament.name}`}
                >
                  <div className="space-y-1 flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-2xl font-bold text-ink engraved group-hover:text-gold transition-colors truncate">
                        {tournament.name}
                      </h3>
                      {tournament.state === 'finished' && (
                        <CheckCircle className="w-5 h-5 text-gold shrink-0" aria-hidden="true" />
                      )}
                      {tournament.state === 'finished' && (
                        <span className="sr-only">Finished tournament</span>
                      )}
                    </div>
                    {tournament.description && (
                      <p className="text-sm text-muted engraved italic truncate w-full mb-3">
                        {tournament.description}
                      </p>
                    )}
                    <div className="flex items-center text-sm text-muted engraved gap-4 font-medium overflow-hidden">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <span className="flex items-center shrink-0">
                          <Calendar className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                          <span className="sr-only">Date:</span> {formatDate(tournament.date)}
                        </span>
                        <span className="flex items-center shrink-0">
                          <Users className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                          {tournament.players.length}<span className="hidden sm:inline ml-1">Players</span>
                          <span className="sr-only">Players</span>
                        </span>
                        <span className="flex items-center shrink-0">
                          <Gamepad2 className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                            {getGamesPlayedCount(tournament)}<span className="hidden sm:inline ml-1">Games</span>
                          <span className="sr-only">Games</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Three-dot menu */}
                  {user?.uid === tournament.ownerId && (
                    <div className="absolute top-3 right-3">
                      <DropdownMenu
                        ariaLabel={`Tournament actions for ${tournament.name}`}
                        usePortal={true}
                          items={[
                            tournament.state === 'active' ? {
                              label: 'End Tournament',
                              icon: <CheckCircle className="w-4 h-4" aria-hidden="true" />,
                              onClick: () => { setTournamentToEnd(tournament.id); setIsEndTournamentModalOpen(true); },
                            } : {
                              label: 'Re-Open Tournament',
                              icon: <RotateCcw className="w-4 h-4" aria-hidden="true" />,
                              onClick: () => { setTournamentToReopen(tournament.id); setIsReopenTournamentModalOpen(true); },
                            },
                            {
                              label: 'Delete Tournament',
                              icon: <Trash2 className="w-4 h-4" aria-hidden="true" />,
                              onClick: () => { setTournamentToDelete(tournament.id); setIsDeleteModalOpen(true); },
                              variant: 'danger',
                            },
                          ]}
                        />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

            {/* Shared With You Section */}
            {!isLoadingInitialData && sharedTournaments.length > 0 && (
              <section aria-labelledby="shared-tournaments-heading">
                <div className="flex items-center gap-2 px-2 mb-6">
                  <Share2 className="w-5 h-5 text-gold" aria-hidden="true" />
                  <h2 id="shared-tournaments-heading" className="text-xl font-bold text-ink engraved">
                    Shared with You
                  </h2>
                </div>

                <div className="grid gap-4 w-full" role="list">
                  {sharedTournaments.map(tournament => (
                    <SharedTournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      onOpen={handleOpenTournament}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : activeTab === 'library' ? (
          <>
            {/* Library Section */}
            <section aria-labelledby="libraries-heading">
              <div className="flex justify-between items-center mb-6">
                <h2 id="libraries-heading" className="text-xl font-bold text-ink engraved flex items-center gap-2">
                  Your Libraries
                </h2>
                <Button onClick={() => setIsCreateLibraryModalOpen(true)} size="sm" variant="secondary" aria-label="Create new library">
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                  <span className="hidden sm:inline">New Library</span>
                  <span className="sm:hidden">Library</span>
                </Button>
              </div>

              {isLoadingInitialData ? (
                <div className="card-medieval p-12 text-center">
                  <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4 animate-pulse" aria-hidden="true">
                    <BookOpen className="w-5 h-5 text-gold-2" />
                  </div>
                  <h3 className="text-xl font-bold text-ink engraved mb-2">Loading libraries...</h3>
                  <p className="text-muted text-base">Please wait a moment.</p>
                </div>
              ) : libraryList.length === 0 ? (
                <div className="card-medieval p-12 text-center">
                  <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
                    <BookOpen className="w-5 h-5 text-gold-2" />
                  </div>
                  <h3 className="text-xl font-bold text-ink engraved mb-2">No libraries yet</h3>
                  <p className="text-muted text-base mb-6">Create your first library to start tracking your collection.</p>
                  <Button onClick={() => setIsCreateLibraryModalOpen(true)} variant="primary">
                    Create First Library
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 w-full" role="list">
                  {libraryList.map((library) => {
                    const gameCount = getLibraryGameCount(library.id);

                    return (
                      <div
                        key={library.id}
                        onClick={() => navigate(`/library/${library.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/library/${library.id}`)}
                        role="listitem"
                        tabIndex={0}
                        className={cn(
                          'card-medieval card-medieval-interactive p-6 cursor-pointer group w-full relative',
                          library.systemKey === 'my' && 'border-2 border-gold'
                        )}
                        aria-label={`Open library: ${library.name}`}
                      >
                        <div className="space-y-1 flex-1 min-w-0 pr-4">
                          {/* Title row */}
                          <h3 className="text-2xl font-bold text-ink engraved group-hover:text-gold transition-colors truncate">
                            {library.name}
                          </h3>
                          
                          {/* Description */}
                          {library.description && (
                            <p className="text-sm text-muted engraved italic line-clamp-2 w-full">
                              {library.description}
                            </p>
                          )}
                          
                          {/* Metadata row */}
                          <div className="flex items-center text-sm text-muted engraved gap-4 font-medium pt-1">
                            <span className="flex items-center shrink-0">
                              <Gamepad2 className="w-4 h-4 mr-1.5 opacity-60" aria-hidden="true" />
                              {gameCount} game{gameCount !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 capitalize text-xs">
                              {library.visibility === 'private' ? (
                                <Lock className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
                              ) : (
                                <Globe className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
                              )}
                              {library.visibility}
                            </span>
                            {library.systemKey && (
                              <span className="text-xs text-gold-2 font-medium">System</span>
                            )}
                          </div>
                        </div>

                        {/* Three-dot menu */}
                        <div className="absolute top-3 right-3">
                          <DropdownMenu
                            ariaLabel={`Library actions for ${library.name}`}
                            usePortal={true}
                              items={[
                                library.visibility === 'private' ? {
                                  label: 'Set Public',
                                  icon: <Globe className="w-4 h-4" aria-hidden="true" />,
                                  onClick: () => updateLibrary(library.id, { visibility: 'public' }),
                                } : {
                                  label: 'Set Private',
                                  icon: <Lock className="w-4 h-4" aria-hidden="true" />,
                                  onClick: () => updateLibrary(library.id, { visibility: 'private' }),
                                },
                                {
                                  label: 'Edit Library',
                                  icon: <Edit2 className="w-4 h-4" aria-hidden="true" />,
                                  onClick: () => navigate(`/library/${library.id}`),
                                },
                                ...(library.visibility === 'public' && userProfile?.userCode ? [{
                                  label: 'Copy Share Link',
                                  icon: <LinkIcon className="w-4 h-4" aria-hidden="true" />,
                                  onClick: () => handleCopyShareLink(library.id),
                                }] : []),
                                // Only allow deletion of non-system libraries
                                ...(!library.systemKey ? [{
                                  label: 'Delete Library',
                                  icon: <Trash2 className="w-4 h-4" aria-hidden="true" />,
                                  onClick: () => setDeleteLibraryConfirmId(library.id),
                                  variant: 'danger' as const,
                                }] : []),
                              ]}
                            />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'plays' ? (
          <>
            {/* Plays Section */}
            {isLoadingInitialData ? (
              <div className="card-medieval p-12 text-center">
                <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4 animate-pulse" aria-hidden="true">
                  <Gamepad2 className="w-5 h-5 text-gold-2" />
                </div>
                <h3 className="text-xl font-bold text-ink engraved mb-2">Loading plays...</h3>
                <p className="text-muted text-base">Please wait a moment.</p>
              </div>
            ) : userSessions.length === 0 ? (
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
                <div className="mb-6">
                  <PlaysFiltersBar
                    filters={playsFilters}
                    sort={playsSort}
                    onFiltersChange={setPlaysFilters}
                    onSortChange={setPlaysSort}
                    totalCount={userSessions.length}
                    filteredCount={filteredSessions.length}
                    onLogPlay={handleLogPlay}
                  />
                </div>

                {filteredSessions.length === 0 ? (
                  <div className="card-medieval p-12 text-center">
                    <div className="mx-auto w-12 h-12 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
                      <Gamepad2 className="w-5 h-5 text-gold-2" />
                    </div>
                    <h3 className="text-xl font-bold text-ink engraved mb-2">No plays match your filters</h3>
                    <p className="text-muted text-base mb-6">Try adjusting your search or filter criteria.</p>
                    <Button onClick={() => setPlaysFilters({})} variant="secondary">
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
          </>
        ) : null}
      </main>
      
      <Modal 
        isOpen={isEndTournamentModalOpen} 
        onClose={cancelEndTournament} 
        title="Save Tournament?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will finalize the rankings and save the game. No further sessions can be added.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={cancelEndTournament}>Wait</Button>
            <Button variant="primary" onClick={confirmEndTournament}>Save Results</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isReopenTournamentModalOpen} 
        onClose={cancelReopenTournament} 
        title="Re-Open Tournament?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will allow you to add more game sessions and modify the tournament.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={cancelReopenTournament}>Cancel</Button>
            <Button variant="primary" onClick={confirmReopenTournament}>Re-Open</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={cancelDeleteTournament} 
        title="Delete Tournament?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will remove the tournament and its games from this device and your account.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={cancelDeleteTournament}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteTournament}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* Create Library Modal */}
      <Modal
        isOpen={isCreateLibraryModalOpen}
        onClose={() => setIsCreateLibraryModalOpen(false)}
        title="Create New Library"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="library-name" className="block text-sm font-medium text-ink">
              Library Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="library-name"
              type="text"
              value={newLibraryName}
              onChange={(e) => setNewLibraryName(e.target.value.slice(0, NAME_MAX))}
              placeholder="e.g., Home Collection"
              maxLength={NAME_MAX}
              autoFocus
            />
            <div className="text-xs text-muted text-right">{newLibraryName.length}/{NAME_MAX}</div>
          </div>

          <div className="space-y-2">
            <label htmlFor="library-description" className="block text-sm font-medium text-ink">
              Description <span className="text-muted text-xs">(optional)</span>
            </label>
            <Textarea
              id="library-description"
              value={newLibraryDescription}
              onChange={(e) => setNewLibraryDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Add a description for your library..."
              maxLength={DESCRIPTION_MAX}
              rows={3}
              className="resize-none"
            />
            <div className="text-xs text-muted text-right">{newLibraryDescription.length}/{DESCRIPTION_MAX}</div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Visibility</label>
            <div className="space-y-2">
              {(['public', 'private'] as const).map((vis) => (
                <label
                  key={vis}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors',
                    newLibraryVisibility === vis
                      ? 'border-gold bg-gold/5'
                      : 'border-border-2 hover:border-gold-2'
                  )}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={vis}
                    checked={newLibraryVisibility === vis}
                    onChange={() => setNewLibraryVisibility(vis)}
                    className="sr-only"
                  />
                  <div>
                    <div className="font-medium text-ink capitalize">{vis}</div>
                    <div className="text-xs text-muted">
                      {vis === 'public'
                        ? 'Anyone with your share link can view'
                        : 'Only you can see this library'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={() => setIsCreateLibraryModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateLibrary}
              disabled={!newLibraryName.trim()}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Library
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Library Modal */}
      <Modal
        isOpen={!!deleteLibraryConfirmId}
        onClose={() => setDeleteLibraryConfirmId(null)}
        title="Delete Library?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved">
            Are you sure you want to delete{' '}
            <strong className="text-ink">{deleteLibraryConfirmId && libraries[deleteLibraryConfirmId]?.name}</strong>?
            This will permanently delete the library and all {deleteLibraryConfirmId && getLibraryGameCount(deleteLibraryConfirmId)} games in it.
            This action cannot be undone.
          </p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={() => setDeleteLibraryConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteLibrary}>
              Delete Library
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
