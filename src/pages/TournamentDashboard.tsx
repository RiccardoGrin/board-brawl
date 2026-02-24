import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trophy, Crown, Gamepad2, Users, CheckCircle, ChevronDown, ChevronUp, ArrowLeft, Edit2, Trash2, Save, X, ArrowUpDown, MoreVertical, RotateCcw, Link, Eye, UserPlus } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { calculateLeaderboard, type PlayerStats } from '../utils/stats';
import { Button } from '../components/ui/button';
import { Input, Textarea } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { ColorSelector } from '../components/ui/color-selector';
import { PlayerInput } from '../components/ui/player-input';
import { TeamIconBadge } from '../components/ui/team-icon-selector';
import { PREDEFINED_COLORS, getRandomColor } from '../utils/colors';
import { cn } from '../utils/cn';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { useAuthStore } from '../store/authStore';
import { useOwnerProfile } from '../hooks/useOwnerProfile';
import { useNotificationStore } from '../store/notificationStore';
import { BracketView } from '../components/BracketView';
import { MatchResultModal } from '../components/MatchResultModal';
import { calculateStandings } from '../utils/bracketGenerator';
import type { BracketMatch, GameSession, GameSessionResults, ParticipantResult, Player } from '../types/tournament';
import { DropdownMenu } from '../components/ui/dropdown-menu';

/**
 * PlayerNameLink - Renders a player name that's clickable if the player is linked.
 * Linked players (with userId and userCode) navigate to their profile page.
 */
function PlayerNameLink({
  player,
  className,
  onClick,
}: {
  player: Player | undefined;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();

  if (!player) {
    return <span className={className}>Unknown</span>;
  }

  // If player is linked with userCode, make the name clickable
  if (player.userId && player.userCode) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
          navigate(`/u/${player.userCode}`);
        }}
        className={cn(className, 'hover:text-gold cursor-pointer transition-colors')}
      >
        {player.name}
      </button>
    );
  }

  // Non-linked player - just display the name
  return <span className={className}>{player.name}</span>;
}

/**
 * Extract flat results from a session for display.
 * Handles both new Phase 3 format and legacy format.
 */
function getDisplayResults(session: GameSession): { playerId: string; rank: number; points: number; teamId?: string }[] {
  const results = session.results;

  // New format: has 'placements' property
  if (results && 'placements' in results && Array.isArray((results as GameSessionResults).placements)) {
    const newResults = results as GameSessionResults;
    const flatResults: { playerId: string; rank: number; points: number; teamId?: string }[] = [];

    // Get team assignments from participants
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

  // Legacy format
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

/**
 * Check if session is a team game.
 */
function isTeamGame(session: GameSession): boolean {
  // New format
  if (session.results && 'mode' in session.results) {
    return (session.results as GameSessionResults).mode === 'teams';
  }
  // Legacy format
  return session.gameType === 'team';
}

/**
 * Get the played date from a session.
 */
function getSessionDate(session: GameSession): string {
  return session.playedAt || session.datePlayed || session.createdAt || '';
}

const NAME_MAX = 25;
const DESCRIPTION_MAX = 60;
const COUNTER_THRESHOLD = {
  name: Math.ceil(NAME_MAX * 0.8),
  description: Math.ceil(DESCRIPTION_MAX * 0.8),
};

type SortKey = 'totalPoints' | 'gamesPlayed' | 'averagePoints';
type SortDirection = 'asc' | 'desc';

export default function TournamentDashboard() {
  const navigate = useNavigate();
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const loadTournament = useTournamentStore(state => state.loadTournament);
  const finishTournament = useTournamentStore(state => state.finishTournament);
  const reopenTournament = useTournamentStore(state => state.reopenTournament);
  const updateTournament = useTournamentStore(state => state.updateTournament);
  const deleteTournament = useTournamentStore(state => state.deleteTournament);
  const addPlayer = useTournamentStore(state => state.addPlayer);
  const removePlayer = useTournamentStore(state => state.removePlayer);
  const updatePlayer = useTournamentStore(state => state.updatePlayer);
  const deleteGameSession = useTournamentStore(state => state.deleteGameSession);
  const user = useAuthStore(state => state.user);
  const userProfile = useAuthStore(state => state.userProfile);
  const showNotification = useNotificationStore(state => state.show);

  // Load tournament from URL params on mount
  useEffect(() => {
    if (tournamentId) {
      loadTournament(tournamentId);
    }
  }, [tournamentId, loadTournament]);

  // Subscribe to the specific tournament (this creates a stable reference)
  const tournament = useTournamentStore(
    state => tournamentId ? state.tournaments[tournamentId] : undefined
  );
  
  // Memoize sessions based on session IDs string to avoid infinite loops
  const sessionIdsKey = tournament?.gameSessions.join(',') || '';
  const sessions = useMemo(() => {
    if (!tournament) return [];
    const store = useTournamentStore.getState();
    return tournament.gameSessions
      .map(id => store.gameSessions[id])
      .filter(Boolean);
  }, [sessionIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState<'standings' | 'games' | 'players'>('standings');
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<string[]>([]);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 640 : true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'totalPoints', direction: 'desc' });
  
  const [isEndTournamentModalOpen, setIsEndTournamentModalOpen] = useState(false);
  const [isReopenTournamentModalOpen, setIsReopenTournamentModalOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [playerToDeleteId, setPlayerToDeleteId] = useState<string | null>(null);
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [isDeleteTournamentModalOpen, setIsDeleteTournamentModalOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerColor, setNewPlayerColor] = useState(() => getRandomColor());
  const [newPlayerUserId, setNewPlayerUserId] = useState<string | undefined>(undefined);
  const [newPlayerUserCode, setNewPlayerUserCode] = useState<string | undefined>(undefined);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editUserId, setEditUserId] = useState<string | undefined>(undefined);
  const [editUserCode, setEditUserCode] = useState<string | undefined>(undefined);

  // Tournament editing state
  const [isEditingTournamentName, setIsEditingTournamentName] = useState(false);
  const [isEditingTournamentDescription, setIsEditingTournamentDescription] = useState(false);
  const [tournamentNameEdit, setTournamentNameEdit] = useState('');
  const [tournamentDescriptionEdit, setTournamentDescriptionEdit] = useState('');

  // Bracket-specific state
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);
  const updateBracketMatch = useTournamentStore(state => state.updateBracketMatch);

  useEffect(() => {
    if (tournament) {
      setTournamentNameEdit(tournament.name);
      setTournamentDescriptionEdit(tournament.description || '');
    }
  }, [tournament?.id, tournament?.name, tournament?.description]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(typeof window !== 'undefined' ? window.innerWidth >= 640 : true);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isActionsMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isActionsMenuOpen]);

  // useMemo hooks MUST come before any early returns to avoid React hooks violation
  const leaderboard = useMemo(() => {
    if (!tournament) return [];
    const calculated: PlayerStats[] = calculateLeaderboard(tournament, sessions);
    calculated.sort((a, b) => {
      if (sortConfig.direction === 'asc') {
        return a[sortConfig.key] - b[sortConfig.key];
      }
      return b[sortConfig.key] - a[sortConfig.key];
    });
    return calculated;
  }, [tournament, sessions, sortConfig]);

  const topScore = useMemo(() => {
    return leaderboard.reduce((max, entry) => Math.max(max, entry.totalPoints), 0);
  }, [leaderboard]);

  // Fetch owner's current display name dynamically (for shared tournaments)
  const ownerDisplayName = useOwnerProfile(tournament?.ownerId, tournament?.ownerName);

  // Early return AFTER all hooks are called
  if (!tournament) {
    return <Navigate to="/" />;
  }

  // Permission check: can the current user edit this tournament?
  // Only owner and editors can make changes; viewers are read-only
  const userRole = user?.uid ? tournament.memberRoles?.[user.uid] : undefined;
  const isOwner = user?.uid === tournament.ownerId;
  const isEditor = userRole === 'editor';
  const canEdit = isOwner || isEditor;

  // Check if this is a bracket tournament
  const isBracket = tournament.format === 'bracket';
  const bracketConfig = tournament.bracketConfig;

  const gamesPlayedCount = useMemo(() => {
    if (isBracket && bracketConfig) {
      return bracketConfig.bracket.filter(match => match.isComplete).length;
    }
    return sessions.length;
  }, [isBracket, bracketConfig, sessions.length]);

  // Handlers for bracket matches
  const handleMatchClick = (match: BracketMatch) => {
    if (!canEdit) return;
    setSelectedMatch(match);
  };

  const handleMatchResultConfirm = (winnerId: string | null) => {
    if (!tournament || !selectedMatch) return;
    
    updateBracketMatch(tournament.id, selectedMatch.id, winnerId);
    setSelectedMatch(null);
    
    if (winnerId === null) {
      showNotification('success', 'Match result cleared');
    } else {
      showNotification('success', 'Match result recorded');
    }
  };

  const handleMatchResultCancel = () => {
    setSelectedMatch(null);
  };

  const handleSaveTournamentName = () => {
    if (tournamentNameEdit.trim() && tournamentNameEdit.length <= NAME_MAX) {
      updateTournament(tournament.id, { name: tournamentNameEdit.trim() });
      setIsEditingTournamentName(false);
    }
  };

  const handleSaveTournamentDescription = () => {
    if (tournamentDescriptionEdit.length <= DESCRIPTION_MAX) {
      updateTournament(tournament.id, { description: tournamentDescriptionEdit.trim() || undefined });
      setIsEditingTournamentDescription(false);
    }
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const confirmEndTournament = () => {
    finishTournament(tournament.id);
    setIsEndTournamentModalOpen(false);
  };

  const confirmReopenTournament = () => {
    reopenTournament(tournament.id);
    setIsReopenTournamentModalOpen(false);
  };

  const requestDeleteTournament = () => {
    setIsDeleteTournamentModalOpen(true);
    setIsActionsMenuOpen(false);
  };

  const confirmDeleteTournament = () => {
    deleteTournament(tournament.id);
    setIsDeleteTournamentModalOpen(false);
    navigate('/');
  };

  const confirmDeleteSession = () => {
    if (!sessionToDeleteId) return;
    deleteGameSession(tournament.id, sessionToDeleteId);
    showNotification('success', 'Game session deleted');
    setSessionToDeleteId(null);
  };

  const confirmDeletePlayer = () => {
    if (playerToDeleteId) {
      const success = removePlayer(tournament.id, playerToDeleteId);
      if (!success) {
        showNotification('error', 'Cannot remove player who has already played games');
      }
      setPlayerToDeleteId(null);
    }
  };

  const startAddPlayer = () => {
    const usedColors = tournament.players.map(p => p.color).filter((c): c is string => Boolean(c));
    setNewPlayerColor(getRandomColor(usedColors));
    setNewPlayerName('');
    setNewPlayerUserId(undefined);
    setNewPlayerUserCode(undefined);
    setIsAddingPlayer(true);
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlayerName.trim()) {
      addPlayer(tournament.id, newPlayerName, newPlayerColor, newPlayerUserId, newPlayerUserCode);
      setNewPlayerName('');
      setNewPlayerUserId(undefined);
      setNewPlayerUserCode(undefined);
      setIsAddingPlayer(false);
    }
  };

  const startEditPlayer = (player: {id: string, name: string, color?: string, userId?: string, userCode?: string}) => {
    setEditingPlayerId(player.id);
    setEditName(player.name);
    setEditColor(player.color || PREDEFINED_COLORS[0]);
    setEditUserId(player.userId);
    setEditUserCode(player.userCode);
  };

  const saveEditPlayer = () => {
    if (editingPlayerId && editName.trim()) {
      updatePlayer(tournament.id, editingPlayerId, { name: editName, color: editColor, userId: editUserId, userCode: editUserCode });
      setEditingPlayerId(null);
    }
  };

  const handleAddMyself = () => {
    if (!user?.uid || !userProfile.userCode) return;

    const displayName = userProfile.displayName || `Player #${userProfile.userCode}`;
    const usedColors = tournament.players.map(p => p.color).filter((c): c is string => Boolean(c));
    addPlayer(tournament.id, displayName, getRandomColor(usedColors), user.uid, userProfile.userCode);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const toggleExpanded = (playerId: string) => {
    setExpandedPlayerIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-4 h-4 opacity-40 shrink-0" />;
    }
    if (sortConfig.direction === 'asc') {
      return <ChevronUp className="w-4 h-4 text-gold shrink-0" />;
    }
    return <ChevronDown className="w-4 h-4 text-gold shrink-0" />;
  };

  return (
    <div className="min-h-screen pb-20 page-frame">
      <SEO
        path={`/tournament/${tournamentId}`}
        title={`${tournament.name} dashboard`}
        description={`View standings, games, and players for ${tournament.name}. Live totals, averages, and detailed history.`}
      />
      
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative">
          {/* Profile icon - positioned inline with header content */}
          <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6">
            <AuthMenu />
          </div>
          <div className="flex justify-between items-start mb-4 sm:mb-6 pr-16">
             <div className="flex items-center gap-4 flex-1 min-w-0">
                <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="-ml-2 text-muted h-10 w-10 shrink-0 rounded-[4px] hover:bg-gold-2/20 hover:text-ink">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1 min-w-0">
                   {isEditingTournamentName ? (
                     <div className="flex items-center gap-2 max-w-md -ml-3 -mt-1.5">
                       <div className="flex-1 relative">
                          <Input 
                            autoFocus
                            value={tournamentNameEdit}
                            onChange={(e) => setTournamentNameEdit(e.target.value.slice(0, NAME_MAX))}
                            className="text-2xl font-bold h-11 border-gold-2/30 focus:border-gold bg-paper/50"
                          />
                          {tournamentNameEdit.length >= COUNTER_THRESHOLD.name && (
                            <span className="absolute right-2 bottom-1 text-[10px] text-muted tabular">
                              {tournamentNameEdit.length}/{NAME_MAX}
                            </span>
                          )}
                       </div>
                       <div className="flex items-center">
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted hover:text-ink" onClick={() => {
                          setIsEditingTournamentName(false);
                          setTournamentNameEdit(tournament.name);
                        }}>
                          <X className="w-5 h-5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted hover:text-gold" onClick={handleSaveTournamentName}>
                          <Save className="w-5 h-5" />
                        </Button>
                       </div>
                     </div>
                   ) : (
                     <h1 
                        className={cn(
                          "text-4xl font-bold text-ink engraved tracking-tight leading-tight py-1 flex items-center gap-2",
                          canEdit && tournament.state === 'active' && "cursor-pointer hover:text-gold transition-colors",
                          (!canEdit || tournament.state === 'finished') && "cursor-default"
                        )}
                        onClick={() => canEdit && tournament.state === 'active' && setIsEditingTournamentName(true)}
                      >
                      <span className="truncate">{tournament.name}</span>
                      {tournament.state === 'finished' && (
                        <CheckCircle className="w-6 h-6 text-gold shrink-0" aria-hidden="true" />
                      )}
                      {tournament.state === 'finished' && (
                        <span className="sr-only">Finished tournament</span>
                      )}
                      {!canEdit && user && (
                        <span className="badge-medieval text-xs border-blue-200 text-blue-700 bg-blue-50 px-2 py-0.5 flex items-center gap-1 shrink-0" title="You can view this tournament but cannot make changes">
                          <Eye className="w-3 h-3" />
                          Viewing
                        </span>
                      )}
                     </h1>
                   )}
                   
                   {isEditingTournamentDescription ? (
                     <div className="flex items-start gap-2 mt-1 max-w-md -ml-3">
                       <div className="flex-1 relative">
                          <Textarea 
                            autoFocus
                            value={tournamentDescriptionEdit}
                            onChange={(e) => setTournamentDescriptionEdit(e.target.value.slice(0, DESCRIPTION_MAX))}
                            className="text-base italic min-h-[70px] border-gold-2/30 focus:border-gold py-2 bg-paper/50"
                            placeholder="Add description..."
                          />
                          {tournamentDescriptionEdit.length >= COUNTER_THRESHOLD.description && (
                            <span className="absolute right-2 bottom-1 text-[10px] text-muted tabular">
                              {tournamentDescriptionEdit.length}/{DESCRIPTION_MAX}
                            </span>
                          )}
                       </div>
                       <div className="flex flex-col">
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted hover:text-ink" onClick={() => {
                          setIsEditingTournamentDescription(false);
                          setTournamentDescriptionEdit(tournament.description || '');
                        }}>
                          <X className="w-5 h-5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted hover:text-gold" onClick={handleSaveTournamentDescription}>
                          <Save className="w-5 h-5" />
                        </Button>
                       </div>
                     </div>
                   ) : (
                      <>
                        <p 
                          className={cn(
                            "text-base text-muted engraved italic mt-0.5 line-clamp-2 py-1",
                            canEdit && tournament.state === 'active' && "cursor-pointer hover:text-gold transition-colors",
                            (!canEdit || tournament.state === 'finished') && "cursor-default",
                            !tournament.description && !canEdit && "hidden"
                          )}
                          onClick={() => canEdit && tournament.state === 'active' && setIsEditingTournamentDescription(true)}
                        >
                          {tournament.description || (canEdit && tournament.state === 'active' ? "Click to add description..." : "")}
                        </p>
                        {!canEdit && user && ownerDisplayName && (
                          <p className="text-xs text-muted/80 mt-1">
                            Hosted by {ownerDisplayName}
                          </p>
                        )}
                      </>
                   )}
                </div>
             </div>

          </div>
          
          <div className="relative flex items-center justify-between">
            <div className="flex space-x-10">
              {[
                { id: 'standings', label: 'Standings', icon: Trophy },
                { id: 'games', label: `Games (${gamesPlayedCount})`, icon: Gamepad2 },
                { id: 'players', label: `Players (${tournament.players.length})`, icon: Users }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "pb-2 text-base font-bold engraved transition-all flex items-center gap-2 border-b-2",
                    activeTab === tab.id 
                      ? "border-gold text-gold" 
                      : "border-transparent text-muted hover:text-ink hover:border-gold-2/50"
                  )}
                >
                  <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "text-gold" : "text-muted")} />
                  <span className={cn(
                    "transition-all duration-200",
                    activeTab === tab.id ? "opacity-100 w-auto" : "opacity-0 w-0 sm:opacity-100 sm:w-auto overflow-hidden whitespace-nowrap"
                  )}>
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="shrink-0 mb-2" ref={actionsMenuRef}>
              {isOwner && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Tournament actions"
                    aria-expanded={isActionsMenuOpen}
                    onClick={() => setIsActionsMenuOpen(prev => !prev)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-muted hover:text-ink"
                  >
                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  </Button>
                  {isActionsMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Tournament actions"
                      className="absolute right-0 top-12 z-50 card-medieval bg-white shadow-main p-2 w-56"
                    >
                      <div className="px-2 py-1 text-xs text-muted">
                        Owner: You
                      </div>
                      {tournament.state === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 text-sm"
                          onClick={() => {
                            setIsActionsMenuOpen(false);
                            setIsEndTournamentModalOpen(true);
                          }}
                        >
                          <CheckCircle className="w-4 h-4" aria-hidden="true" />
                          <span>End Tournament</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 text-sm"
                          onClick={() => {
                            setIsActionsMenuOpen(false);
                            setIsReopenTournamentModalOpen(true);
                          }}
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>Re-Open Tournament</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 text-sm text-red-600 hover:text-red-700"
                        onClick={requestDeleteTournament}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        <span>Delete Tournament</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
           </div>
          </div>
        </div>
      </header>

      <main id="main-content" role="main" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeTab === 'standings' && (
          <div className="card-medieval overflow-hidden max-w-full">
            <div className="table-shell m-1">
              <div className="overflow-x-auto">
                {isBracket && bracketConfig ? (
                  <table className="w-full text-left table-fixed">
                    <caption className="sr-only">Bracket tournament standings</caption>
                    <thead className="text-muted engraved font-bold border-b border-border-2">
                      <tr>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-20 text-sm shrink-0">Rank</th>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-16 sm:w-64 text-sm shrink-0">Player</th>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-24 text-right text-sm shrink-0">W-L</th>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-32 text-right text-sm shrink-0">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-2">
                      {calculateStandings(bracketConfig.bracket, tournament.players).map((standing) => {
                        const player = tournament.players.find(p => p.id === standing.playerId);
                        const isChampion = standing.placement === 'Champion';

                        return (
                          <tr key={standing.playerId} className="hover:bg-gold-2/10 transition-all">
                            <td className="px-4 sm:px-6 py-5">
                              <div className={cn(
                                "badge-medieval tabular engraved font-bold w-12 h-10 sm:w-14 sm:h-11 justify-center text-sm sm:text-base",
                                isChampion && "border-gold text-gold ring-1 ring-gold/20"
                              )}>
                                {isChampion && (
                                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 absolute -top-2 -left-2 sm:-top-2.5 sm:-left-2.5 text-gold shrink-0" />
                                )}
                                {standing.rank}
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-5">
                              <div className="flex items-center">
                                <div
                                  className="w-10 h-10 sm:w-11 sm:h-11 rounded border border-ink/10 flex items-center justify-center text-white font-bold mr-0 sm:mr-4 shadow-soft text-sm sm:text-base shrink-0"
                                  style={{ backgroundColor: player?.color || '#ccc' }}
                                >
                                  {player?.name.charAt(0).toUpperCase()}
                                </div>
                                <PlayerNameLink
                                  player={player}
                                  className="font-bold text-ink engraved text-sm sm:text-base truncate max-w-[8rem] sm:max-w-[12rem] hidden sm:inline"
                                />
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-5 text-right text-muted tabular text-sm sm:text-base">
                              {standing.wins}-{standing.losses}
                            </td>
                            <td className="px-4 sm:px-6 py-5 text-right text-muted text-xs sm:text-sm truncate">
                              {standing.placement}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left table-fixed">
                    <caption className="sr-only">Tournament leaderboard sortable by points, games played, or average points</caption>
                    <thead className="text-muted engraved font-bold border-b border-border-2">
                      <tr>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-20 text-sm shrink-0">Rank</th>
                        <th scope="col" className="px-4 sm:px-6 py-5 w-16 sm:w-64 text-sm shrink-0">Player</th>
                        <th 
                          scope="col"
                          className="px-4 sm:px-6 py-5 w-24 text-right cursor-pointer group text-sm shrink-0"
                          onClick={() => requestSort('totalPoints')}
                          aria-sort={sortConfig.key === 'totalPoints' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            Points <span className="hidden sm:inline-block">{getSortIcon('totalPoints')}</span>
                          </div>
                        </th>
                        <th 
                          scope="col"
                          className="px-4 sm:px-6 py-5 w-24 text-right cursor-pointer group text-sm shrink-0"
                          onClick={() => requestSort('gamesPlayed')}
                          aria-sort={sortConfig.key === 'gamesPlayed' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            Played <span className="hidden sm:inline-block">{getSortIcon('gamesPlayed')}</span>
                          </div>
                        </th>
                        <th 
                          scope="col"
                          className="px-4 sm:px-6 py-5 w-24 text-right cursor-pointer group text-sm shrink-0"
                          onClick={() => requestSort('averagePoints')}
                          aria-sort={sortConfig.key === 'averagePoints' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            Avg <span className="hidden sm:inline-block">{getSortIcon('averagePoints')}</span>
                          </div>
                        </th>
                        <th scope="col" className="sm:px-6 py-5 sm:w-16 hidden sm:table-cell shrink-0"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-2">
                    {leaderboard.map((stat, index) => {
                      const player = tournament.players.find(p => p.id === stat.playerId);
                      const isExpanded = expandedPlayerIds.includes(stat.playerId);
                      const isTopScore = stat.totalPoints === topScore && topScore > 0;
                      
                      return (
                        <React.Fragment key={stat.playerId}>
                          <tr 
                            onClick={() => toggleExpanded(stat.playerId)} 
                            className="hover:bg-gold-2/10 cursor-pointer transition-all hover:translate-y-[-1px]"
                          >
                            <td className="px-4 sm:px-6 py-5">
                              <div className={cn(
                                "badge-medieval tabular engraved font-bold w-12 h-10 sm:w-14 sm:h-11 justify-center text-sm sm:text-base",
                                isTopScore && "border-gold text-gold ring-1 ring-gold/20"
                              )}>
                                {isTopScore && (
                                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 absolute -top-2 -left-2 sm:-top-2.5 sm:-left-2.5 text-gold shrink-0" />
                                )}
                                {index + 1}
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-5">
                              <div className="flex items-center">
                                <div
                                  className="w-10 h-10 sm:w-11 sm:h-11 rounded border border-ink/10 flex items-center justify-center text-white font-bold mr-0 sm:mr-4 shadow-soft text-sm sm:text-base shrink-0"
                                  style={{ backgroundColor: player?.color || '#ccc' }}
                                >
                                  {player?.name.charAt(0).toUpperCase()}
                                </div>
                                <PlayerNameLink
                                  player={player}
                                  className="font-bold text-ink engraved text-sm sm:text-base truncate max-w-[8rem] sm:max-w-[12rem] hidden sm:inline"
                                />
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-5 text-right font-bold text-green tabular text-sm sm:text-base">{stat.totalPoints}</td>
                            <td className="px-4 sm:px-6 py-5 text-right text-muted tabular text-sm sm:text-base">{stat.gamesPlayed}</td>
                            <td className="px-4 sm:px-6 py-5 text-right text-muted tabular text-sm sm:text-base">{stat.averagePoints}</td>
                            <td className="sm:px-6 py-5 text-muted hidden sm:table-cell text-right">
                              {isExpanded ? <ChevronUp className="w-6 h-6 shrink-0 inline" /> : <ChevronDown className="w-6 h-6 shrink-0 inline" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-paper-2/40 border-y border-border-2">
                              <td colSpan={isDesktop ? 6 : 5} className="px-4 sm:px-8 py-6 sm:py-8">
                                <div className="flex items-center gap-3 mb-6">
                                  <div className="h-px flex-1 bg-border-2" />
                                  <h4 className="text-sm font-bold text-muted engraved px-2">Game History</h4>
                                  <div className="h-px flex-1 bg-border-2" />
                                </div>
                                {stat.results.length === 0 ? (
                                  <p className="text-base text-muted engraved text-center italic">No game sessions recorded yet.</p>
                                ) : (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    {stat.results.map((res, i) => (
                                      <div key={i} className="card-medieval p-4 bg-white flex justify-between items-center shadow-sm">
                                        <div className="flex items-center gap-3">
                                          <span
                                            className="text-base font-bold text-ink engraved hover:text-gold cursor-pointer transition-colors"
                                            onClick={() => res.gameId && navigate(`/games/${res.gameId}`)}
                                            role={res.gameId ? 'link' : undefined}
                                          >
                                            {res.gameName}
                                          </span>
                                          {res.teamId && (
                                            <TeamIconBadge
                                              value={res.teamId}
                                              size={24}
                                              className="text-ink/70"
                                              muted
                                            />
                                          )}
                                        </div>
                                        <div className="text-sm engraved flex items-center gap-4 font-medium">
                                          <span className="text-muted">Rank: {res.rank}</span>
                                          <span className="font-bold text-green text-base">+{res.points}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'games' && (
          <div className="space-y-6">
            {isBracket && bracketConfig ? (
              <div className="card-medieval p-6 sm:p-8">
                <BracketView
                  tournament={tournament}
                  bracket={bracketConfig.bracket}
                  players={tournament.players}
                  canEdit={canEdit && tournament.state === 'active'}
                  onMatchClick={handleMatchClick}
                />
              </div>
            ) : sessions.length === 0 ? (
              <div className="card-medieval p-16 text-center">
                <div className="mx-auto w-16 h-16 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-6">
                  <Gamepad2 className="w-8 h-8 text-gold-2" />
                </div>
                <h3 className="text-xl font-bold text-ink engraved mb-3">No games yet</h3>
                <p className="text-base text-muted engraved italic mb-10 max-w-xs mx-auto">
                  Start playing and log your first game.
                </p>
                {canEdit && tournament.state === 'active' && (
                  <Button 
                    onClick={() => navigate('/add-game')}
                    variant="primary"
                    size="lg"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Record First Game
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {sessions.slice().reverse().map(session => {
                  const displayResults = getDisplayResults(session);
                  const thumbnail = session.gameThumbnail || session.gameMeta?.thumbnail;

                  return (
                    <div key={session.id} className="card-medieval card-medieval-interactive p-6 group relative">
                      <div className="flex justify-between items-start mb-5 gap-2">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Game Thumbnail */}
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt=""
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded object-cover border border-border-2 shadow-sm shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-xl font-bold text-gold shrink-0">
                              {session.gameName.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3
                                className="text-2xl font-bold text-ink engraved truncate hover:text-gold cursor-pointer transition-colors"
                                onClick={() => session.gameId && navigate(`/games/${session.gameId}`)}
                                role={session.gameId ? 'link' : undefined}
                              >
                                {session.gameName}
                              </h3>
                              {isTeamGame(session) && (
                                <span className="badge-medieval tabular engraved text-xs border-purple-200 text-purple-700 bg-purple-50 px-2 py-0.5 shrink-0">
                                  Teams
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted engraved font-medium">
                              {formatDate(getSessionDate(session))}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Three-dot menu for edit/delete */}
                      {canEdit && tournament.state === 'active' && (
                        <div className="absolute top-3 right-3">
                          <DropdownMenu
                            ariaLabel={`Actions for ${session.gameName}`}
                            usePortal={true}
                            items={[
                              {
                                label: 'Edit',
                                icon: <Edit2 className="w-4 h-4" aria-hidden="true" />,
                                onClick: () => navigate(`/edit-game/${session.id}`),
                              },
                              {
                                label: 'Delete',
                                icon: <Trash2 className="w-4 h-4" aria-hidden="true" />,
                                onClick: () => setSessionToDeleteId(session.id),
                                variant: 'danger',
                              },
                            ]}
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {displayResults
                          .filter(res => res.points > 0)
                          .sort((a, b) => a.rank - b.rank)
                          .map(res => {
                            const p = tournament.players.find(pl => pl.id === res.playerId);
                            return (
                              <div key={res.playerId} className="badge-medieval gap-2 py-1.5 px-4 font-bold">
                                <span className="text-muted border-r border-border-2 pr-2">{res.rank}.</span>
                                <span className="text-ink engraved">{p?.name}</span>
                                <span className="text-green tabular">+{res.points}</span>
                              </div>
                            );
                          })
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="card-medieval p-6 sm:p-8">
            {/* Warning message for bracket tournaments */}
            {isBracket && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
                <div className="text-sm text-blue-900">
                  <p className="font-semibold mb-1">Bracket Tournament</p>
                  <p>
                    Adding or removing players will reset all match results and regenerate the bracket. Player count must be exactly 4, 8, 16, or 32.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-8 sm:mb-10">
              <h3 className="text-2xl font-bold text-ink engraved">Players</h3>
              {canEdit && tournament.state === 'active' && !isAddingPlayer && (
                <div className="flex gap-2">
                  {/* Add Myself button - only show if user is logged in and not already in players list */}
                  {user && userProfile.userCode && !tournament.players.some(p => p.userId === user.uid) && (
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={handleAddMyself}
                      className="flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span className="hidden sm:inline">Add Myself</span>
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={startAddPlayer}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add Player
                  </Button>
                </div>
              )}
            </div>

            {isAddingPlayer && (
              <form onSubmit={handleAddPlayer} className="mb-10 p-5 card-medieval border-dashed">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start sm:items-center">
                   <div className="flex w-full items-center justify-between sm:w-auto">
                    <ColorSelector 
                          color={newPlayerColor} 
                          onChange={setNewPlayerColor} 
                      />
                      <div className="flex gap-2 sm:hidden">
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted hover:text-ink" onClick={() => setIsAddingPlayer(false)}>
                          <X className="w-5 h-5" />
                        </Button>
                        <Button type="submit" variant="ghost" size="icon" className="h-11 w-11 text-muted hover:text-gold" disabled={!newPlayerName.trim()}>
                          <Save className="w-5 h-5" />
                        </Button>
                      </div>
                   </div>
                  {user ? (
                    <PlayerInput
                      value={newPlayerName}
                      onChange={setNewPlayerName}
                      onUserLinked={(userId, displayName, userCode) => {
                        setNewPlayerUserId(userId);
                        setNewPlayerUserCode(userCode);
                        if (displayName) {
                          setNewPlayerName(displayName);
                        }
                      }}
                      onUserUnlinked={() => {
                        setNewPlayerUserId(undefined);
                        setNewPlayerUserCode(undefined);
                      }}
                      linkedUserId={newPlayerUserId}
                      existingUserIds={tournament.players
                        .map(p => p.userId)
                        .filter((id): id is string => !!id)
                      }
                      showUnlinkButton={false}
                      placeholder="Player Name or #code"
                      autoFocus
                      className="flex-1"
                    />
                  ) : (
                    <Input 
                      autoFocus
                      placeholder="Player Name" 
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      className="flex-1 h-11 border-gold-2/30 focus:border-gold text-base"
                    />
                  )}
                  <div className="hidden sm:flex gap-2">
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted hover:text-ink" onClick={() => setIsAddingPlayer(false)}>
                      <X className="w-5 h-5" />
                    </Button>
                    <Button type="submit" variant="ghost" size="icon" className="h-11 w-11 text-muted hover:text-gold" disabled={!newPlayerName.trim()}>
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </form>
            )}

            <div className="flex flex-col gap-5">
              {tournament.players.map(player => {
                const isEditing = editingPlayerId === player.id;
                
                if (isEditing) {
                  return (
                    <div key={player.id} className="p-4 card-medieval border-gold/30">
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start sm:items-center">
                         <div className="flex w-full items-center justify-between sm:w-auto">
                           <ColorSelector 
                               color={editColor} 
                               onChange={setEditColor} 
                            />
                            <div className="flex gap-2 sm:hidden">
                              <Button size="icon" variant="ghost" className="h-11 w-11 text-muted hover:text-ink" onClick={() => setEditingPlayerId(null)}>
                                <X className="w-5 h-5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-11 w-11 text-muted hover:text-gold" onClick={saveEditPlayer}>
                                <Save className="w-5 h-5" />
                              </Button>
                            </div>
                         </div>
                        {user ? (
                          <PlayerInput
                            value={editName}
                            onChange={setEditName}
                            onUserLinked={(userId, displayName, userCode) => {
                              setEditUserId(userId);
                              setEditUserCode(userCode);
                              if (displayName) {
                                setEditName(displayName);
                              }
                            }}
                            onUserUnlinked={() => {
                              setEditUserId(undefined);
                              setEditUserCode(undefined);
                            }}
                            linkedUserId={editUserId}
                            existingUserIds={tournament.players
                              .filter(p => p.id !== player.id)
                              .map(p => p.userId)
                              .filter((id): id is string => !!id)
                            }
                            showUnlinkButton={false}
                            placeholder="Player Name or #code"
                            className="flex-1"
                          />
                        ) : (
                          <Input 
                            value={editName} 
                            onChange={(e) => setEditName(e.target.value)} 
                            className="h-11 text-base flex-1"
                          />
                        )}
                         <div className="hidden sm:flex gap-2">
                          <Button size="icon" variant="ghost" className="h-11 w-11 text-muted hover:text-ink" onClick={() => setEditingPlayerId(null)}>
                            <X className="w-5 h-5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-11 w-11 text-muted hover:text-gold" onClick={saveEditPlayer}>
                            <Save className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={player.id} className="card-medieval card-medieval-interactive p-5 flex items-center justify-between group">
                    <div className="flex items-center min-w-0">
                       <ColorSelector
                             color={player.color || '#ccc'}
                             onChange={(newColor) => {
                                 updatePlayer(tournament.id, player.id, { color: newColor });
                             }}
                             disabled={!canEdit || tournament.state !== 'active'}
                        />
                      <PlayerNameLink
                        player={player}
                        className="font-bold text-ink engraved ml-4 text-xl truncate max-w-[12rem] sm:max-w-none"
                      />
                      {player.userId && (
                        <span className="ml-2 flex items-center gap-1 text-xs text-green-600" title="Linked player - can see this tournament">
                          <Link className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    {canEdit && tournament.state === 'active' && (
                      <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted hover:text-gold" onClick={() => startEditPlayer(player)}>
                          <Edit2 className="w-5 h-5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted hover:text-red-600" onClick={() => setPlayerToDeleteId(player.id)}>
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Hide "Add Game Session" button for bracket tournaments */}
      {canEdit && tournament.state === 'active' && !isBracket && (
        <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-0 sm:bottom-8 sm:right-8 sm:left-auto z-30 bg-paper/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none border-t border-gold-2 sm:border-0">
          <Button 
            className="w-full sm:w-auto h-14 sm:h-16 px-10 rounded-md shadow-main transition-all flex items-center justify-center gap-3 border"
            variant="primary"
            onClick={() => navigate('/add-game')}
          >
            <Gamepad2 className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="text-base font-bold engraved">Add Game Session</span>
          </Button>
        </div>
      )}

      <Modal isOpen={isEndTournamentModalOpen} onClose={() => setIsEndTournamentModalOpen(false)} title="Save Tournament?">
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will finalize the rankings and save the game. No further sessions can be added.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
              <Button variant="ghost" onClick={() => setIsEndTournamentModalOpen(false)}>Wait</Button>
              <Button variant="primary" onClick={confirmEndTournament}>Save Results</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isReopenTournamentModalOpen} onClose={() => setIsReopenTournamentModalOpen(false)} title="Re-Open Tournament?">
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will allow you to add more game sessions and modify the tournament.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
              <Button variant="ghost" onClick={() => setIsReopenTournamentModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={confirmReopenTournament}>Re-Open</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteTournamentModalOpen && isOwner} onClose={() => setIsDeleteTournamentModalOpen(false)} title="Delete Tournament?">
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">This will remove the tournament and all its games from this device and your account.</p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
             <Button variant="ghost" onClick={() => setIsDeleteTournamentModalOpen(false)}>Cancel</Button>
             <Button variant="destructive" onClick={confirmDeleteTournament}>Delete</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!playerToDeleteId} onClose={() => setPlayerToDeleteId(null)} title="Banish Adventurer?">
         <div className="space-y-6">
           <p className="text-base text-muted engraved italic">Are you sure you wish to remove this player from the tournament? This action is irreversible.</p>
           <div className="divider-line" />
           <div className="flex justify-end gap-4">
              <Button variant="ghost" onClick={() => setPlayerToDeleteId(null)}>Mercy</Button>
              <Button variant="destructive" onClick={confirmDeletePlayer}>Banish</Button>
           </div>
         </div>
      </Modal>

      <Modal 
        isOpen={!!sessionToDeleteId} 
        onClose={() => setSessionToDeleteId(null)} 
        title="Delete Game Session?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved italic">
            This will remove the game and its points from the tournament. This cannot be undone.
          </p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={() => setSessionToDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteSession}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* Match Result Modal for bracket tournaments */}
      {selectedMatch && bracketConfig && (
        <MatchResultModal
          match={selectedMatch}
          players={tournament.players}
          totalRounds={bracketConfig.totalRounds}
          isEditMode={selectedMatch.isComplete}
          onConfirm={handleMatchResultConfirm}
          onCancel={handleMatchResultCancel}
        />
      )}
    </div>
  );
}
