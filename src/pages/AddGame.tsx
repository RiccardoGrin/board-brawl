import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { GameRecord } from '../services/gameSearch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Users, User, Clock, Edit2, GripVertical, AlertCircle } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { GameInput } from '../components/ui/game-input';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GAME_PRESETS,
  type GameType,
  type ScoringRules,
  type ParticipantResult,
  type GameSession,
  type GameSessionParticipant,
  type GameSessionResults,
} from '../types/tournament';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { convertToNewResultsFormat, convertFromNewResultsFormat } from '../store/tournamentStore';
import { cn } from '../utils/cn';
import { TeamIconBadge, TeamIconSelector, type TeamIconId } from '../components/ui/team-icon-selector';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';

/**
 * SortableResultItem - A draggable player result row for ranking
 * Uses @dnd-kit/sortable for drag-drop reordering
 */
interface SortableResultItemProps {
  id: string;
  index: number;
  playerName: string;
  teamId?: string;
  points: number;
  hasManualPoints: boolean;
  isEditing: boolean;
  onEditPoints: () => void;
  onSavePoints: (value: number) => void;
}

function SortableResultItem({
  id,
  index,
  playerName,
  teamId,
  points,
  hasManualPoints,
  isEditing,
  onEditPoints,
  onSavePoints,
}: SortableResultItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const rank = index + 1;
  const rankSuffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "card-medieval p-5 bg-white flex items-center gap-5 group transition-all",
        isDragging && "shadow-lg ring-2 ring-gold/30 z-10"
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
        aria-label={`Drag to reorder ${playerName}`}
      >
        <GripVertical className="w-6 h-6 text-gold/50 group-hover:text-gold transition-colors" aria-hidden="true" />
      </div>

      {/* Rank badge */}
      <div className={cn(
        "w-12 h-12 rounded flex items-center justify-center font-bold text-lg engraved shrink-0",
        rank <= 3 ? "bg-gold text-white" : "bg-gold-2 text-muted"
      )}>
        {rank}{rankSuffix}
      </div>

      {/* Player name */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className="font-bold text-ink engraved text-lg truncate">{playerName}</span>
        {teamId && <TeamIconBadge value={teamId} size={24} />}
      </div>

      {/* Points display/edit */}
      <div className="flex items-center gap-3 shrink-0">
        {isEditing ? (
          <Input
            type="number"
            autoFocus
            defaultValue={points}
            className="w-20 h-10 text-center font-bold tabular text-base"
            onBlur={(e) => onSavePoints(parseInt(e.target.value) || 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSavePoints(parseInt((e.target as HTMLInputElement).value) || 0);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onEditPoints}
            className={cn(
              "px-4 py-2 rounded font-bold text-lg tabular min-w-[4rem] transition-colors",
              hasManualPoints
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-gold-2/50 text-gold hover:bg-gold-2"
            )}
            title="Click to edit points"
          >
            {points}
            <Edit2 className="w-3.5 h-3.5 ml-2 inline-block opacity-50" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

const gameSetupSchema = z.object({
  name: z.string().min(1, "Game name is required"),
  gameId: z.string().optional(),
  sourceIds: z.object({ bgg: z.string().optional() }).optional(),
  meta: z.object({
    minPlayers: z.number().optional(),
    maxPlayers: z.number().optional(),
    minPlaytime: z.number().optional(),
    maxPlaytime: z.number().optional(),
    playingTime: z.number().optional(),
    thumbnail: z.string().optional(),
    year: z.number().optional(),
  }).optional(),
  type: z.enum(['ffa', 'team']),
  preset: z.enum(['quick', 'medium', 'big', 'bracket']),
});

type GameSetupValues = z.infer<typeof gameSetupSchema>;

export default function AddGame() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const activeId = useTournamentStore(state => state.activeTournamentId);
  const getTournament = useTournamentStore(state => state.getTournament);
  const addGameSession = useTournamentStore(state => state.addGameSession);
  const updateGameSession = useTournamentStore(state => state.updateGameSession);
  const gameSessions = useTournamentStore(state => state.gameSessions);

  // Get owned game IDs for the dropdown badge
  const userGames = useLibraryStore(state => state.userGames);
  const ownedGameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [gameId, game] of Object.entries(userGames)) {
      if (game.status === 'owned') {
        ids.add(gameId);
      }
    }
    return ids;
  }, [userGames]);

  const tournament = activeId ? getTournament(activeId) : undefined;
  const existingSession = sessionId ? gameSessions[sessionId] : undefined;
  const isEditMode = !!existingSession;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setupData, setSetupData] = useState<GameSetupValues | null>(null);
  
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerTeams, setPlayerTeams] = useState<Record<string, TeamIconId | string>>({});
  const [teamError, setTeamError] = useState<string | null>(null);
  
  const mediumDefaultScoring = GAME_PRESETS['medium'].defaultScoring;
  const [results, setResults] = useState<{playerId: string; rank: number; manualPoints?: number}[]>([]);
  const [customScoring, setCustomScoring] = useState<ScoringRules | null>(() => ({
    ...mediumDefaultScoring
  }));
  const [customScoringInputs, setCustomScoringInputs] = useState<Record<keyof ScoringRules, string>>(() => ({
    first: mediumDefaultScoring.first.toString(),
    second: mediumDefaultScoring.second.toString(),
    third: mediumDefaultScoring.third.toString(),
    others: mediumDefaultScoring.others.toString(),
  }));
  const [editingPointsId, setEditingPointsId] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<GameSetupValues>({
    resolver: zodResolver(gameSetupSchema),
    defaultValues: {
      name: '',
      gameId: undefined,
      sourceIds: undefined,
      meta: undefined,
      type: 'ffa',
      preset: 'medium'
    }
  });

  const watchPreset = watch('preset');
  const watchType = watch('type');
  const watchName = watch('name', '');
  const watchGameId = watch('gameId');
  const watchGameSourceIds = watch('sourceIds');
  const watchGameMeta = watch('meta');

  useEffect(() => {
    register('name');
  }, [register]);

  // Pre-populate game from query parameter (e.g., from game detail page)
  useEffect(() => {
    const preselectedGameId = searchParams.get('gameId');
    // Skip if no gameId in query, or if in edit mode, or if game already selected
    if (!preselectedGameId || isEditMode || watchGameId) return;

    const fetchPreselectedGame = async () => {
      try {
        const gameDocRef = doc(db, 'games', preselectedGameId);
        const gameDocSnap = await getDoc(gameDocRef);

        if (gameDocSnap.exists()) {
          const gameRecord = gameDocSnap.data() as GameRecord;
          setValue('name', gameRecord.primaryName);
          setValue('gameId', preselectedGameId);
          setValue('sourceIds', gameRecord.sourceIds);
          setValue('meta', {
            minPlayers: gameRecord.minPlayers,
            maxPlayers: gameRecord.maxPlayers,
            minPlaytime: gameRecord.minPlaytime,
            maxPlaytime: gameRecord.maxPlaytime,
            playingTime: gameRecord.playingTime,
            thumbnail: gameRecord.thumbnail,
            year: gameRecord.year,
          });
        }
      } catch (err) {
        console.error('Failed to fetch preselected game:', err);
      }
    };

    fetchPreselectedGame();
  }, [searchParams, isEditMode, watchGameId, setValue]);

  const scoreForRank = (rules: ScoringRules, rank: number) => {
    if (rank === 1) return rules.first;
    if (rank === 2) return rules.second;
    if (rank === 3) return rules.third;
    return rules.others;
  };

  const basePointsForPlayer = (
    playerId: string,
    rank: number,
    rules: ScoringRules,
    gameType: GameType,
    currentResults: { playerId: string; rank: number }[],
    teams: Record<string, string>
  ) => {
    if (gameType === 'team') {
      const teamId = teams[playerId];
      if (teamId) {
        const teamRanks = currentResults
          .filter(r => teams[r.playerId] === teamId)
          .map(r => r.rank);
        if (teamRanks.length) {
          const bestRank = Math.min(...teamRanks);
          return scoreForRank(rules, bestRank);
        }
      }
    }
    return scoreForRank(rules, rank);
  };

  useEffect(() => {
    if (isEditMode && existingSession && step === 1 && !setupData) {
      // Determine game type from new or legacy format
      const gameType: GameType = existingSession.results?.mode
        ? (existingSession.results.mode === 'freeForAll' ? 'ffa' : 'team')
        : (existingSession.gameType || 'ffa');

      reset({
        name: existingSession.gameName,
        gameId: existingSession.gameId,
        sourceIds: existingSession.gameSourceIds,
        meta: existingSession.gameMeta,
        type: gameType,
        preset: existingSession.preset
      });
      setSetupData({
        name: existingSession.gameName,
        gameId: existingSession.gameId,
        sourceIds: existingSession.gameSourceIds,
        meta: existingSession.gameMeta,
        type: gameType,
        preset: existingSession.preset
      });

      const loadedScoring = existingSession.scoringRules;
      setCustomScoring(loadedScoring);
      setCustomScoringInputs({
        first: loadedScoring.first.toString(),
        second: loadedScoring.second.toString(),
        third: loadedScoring.third.toString(),
        others: loadedScoring.others.toString(),
      });

      // Handle both new (GameSessionParticipant[]) and legacy (PlayerId[]) formats
      const participantIds = existingSession.participants.map((p: any) =>
        typeof p === 'string' ? p : p.playerId
      );
      setSelectedPlayers(participantIds);

      // Extract teams from participants
      const loadedTeams: Record<string, string> = {};
      existingSession.participants.forEach((p: any) => {
        if (typeof p !== 'string' && p.teamId) {
          loadedTeams[p.playerId] = p.teamId;
        }
      });

      // Convert results from new format to legacy for UI
      let legacyResults: ParticipantResult[];
      if (existingSession.results?.placements) {
        // New format
        legacyResults = convertFromNewResultsFormat(existingSession.results, loadedTeams);
      } else if (Array.isArray(existingSession.results)) {
        // Legacy format (array of ParticipantResult)
        legacyResults = existingSession.results as unknown as ParticipantResult[];
        legacyResults.forEach(r => {
          if (r.teamId) loadedTeams[r.playerId] = r.teamId;
        });
      } else {
        legacyResults = [];
      }

      setPlayerTeams(loadedTeams);

      const sortedResults = [...legacyResults].sort((a, b) => a.rank - b.rank);
      const baseResults = sortedResults.map(r => ({ playerId: r.playerId, rank: r.rank }));
      const hydratedResults = sortedResults.map(r => {
        const basePoints = basePointsForPlayer(
          r.playerId,
          r.rank,
          loadedScoring,
          gameType,
          baseResults,
          loadedTeams
        );
        const manualPoints = r.points === basePoints ? undefined : r.points;
        return { playerId: r.playerId, rank: r.rank, manualPoints };
      });
      setResults(hydratedResults);
    }
  }, [isEditMode, existingSession, reset, step, setupData]);

  useEffect(() => {
    if (!customScoring) return;
    setCustomScoringInputs({
      first: customScoring.first.toString(),
      second: customScoring.second.toString(),
      third: customScoring.third.toString(),
      others: customScoring.others.toString(),
    });
  }, [customScoring]);

  if (!tournament) return <div className="p-8 text-center engraved text-base">No active tournament found.</div>;

  const onSubmitStep1 = (data: GameSetupValues) => {
    setSetupData(data);
    // Preserve any custom edits; only initialize if missing
    if (!customScoring) {
      setCustomScoring(GAME_PRESETS[data.preset].defaultScoring);
    }
    setStep(2);
  };

  const togglePlayer = (id: string) => {
    setSelectedPlayers(prev => {
      const isSelected = prev.includes(id);
      if (isSelected) {
        const newTeams = { ...playerTeams };
        delete newTeams[id];
        setPlayerTeams(newTeams);
        return prev.filter(p => p !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const assignTeam = (playerId: string, teamId: TeamIconId) => {
    setPlayerTeams(prev => ({ ...prev, [playerId]: teamId }));
  };

  const onSubmitStep2 = () => {
    if (selectedPlayers.length < 2) {
      alert("Please select at least 2 players.");
      return;
    }
    setTeamError(null);
    if (setupData?.type === 'team') {
      const missingTeams = selectedPlayers.some(id => !playerTeams[id]);
      if (missingTeams) {
        setTeamError("Please assign a team icon to every selected player.");
        return;
      }
    }

    const initialResults = selectedPlayers.map((id, index) => {
      const existing = results.find(r => r.playerId === id);
      return existing || { playerId: id, rank: index + 1 };
    });
    initialResults.sort((a, b) => a.rank - b.rank);
    const normalized = initialResults.map((r, i) => ({ ...r, rank: i + 1 }));
    setResults(normalized);
    setStep(3);
  };

  // Configure sensors for pointer-based dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Small threshold to differentiate click vs drag
      },
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = results.findIndex(r => r.playerId === active.id);
    const newIndex = results.findIndex(r => r.playerId === over.id);

    const newResults = arrayMove(results, oldIndex, newIndex);
    setResults(newResults.map((r, i) => ({ ...r, rank: i + 1 })));
  };

  const getPointsForPlayer = (playerId: string, rank: number, manualPoints?: number) => {
    if (!customScoring || !setupData) return 0;
    if (manualPoints !== undefined) return manualPoints;
    return basePointsForPlayer(playerId, rank, customScoring, setupData.type, results, playerTeams);
  };

  const updateManualPoints = (playerId: string, points: number) => {
    if (!customScoring || !setupData) {
      setEditingPointsId(null);
      return;
    }
    setResults(prev => prev.map(r => {
      if (r.playerId !== playerId) return r;
      const basePoints = basePointsForPlayer(playerId, r.rank, customScoring, setupData.type, prev, playerTeams);
      const safeValue = Number.isFinite(points) ? Math.max(0, points) : basePoints;
      const manualPoints = safeValue === basePoints ? undefined : safeValue;
      return { ...r, manualPoints };
    }));
    setEditingPointsId(null);
  };

  const handleScoringInputChange = (key: keyof ScoringRules, rawValue: string) => {
    setCustomScoringInputs(prev => ({ ...prev, [key]: rawValue }));
    if (rawValue === '') return;
    setCustomScoring(prev => {
      if (!prev) return prev;
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) return prev;
      const clamped = Math.max(0, numericValue);
      return { ...prev, [key]: clamped };
    });
  };

  const handleScoringInputBlur = (key: keyof ScoringRules) => {
    if (!customScoring) return;
    const rawValue = customScoringInputs[key];
    const normalized = rawValue === '' ? 0 : Number(rawValue);
    const safeValue = Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
    setCustomScoring(prev => prev ? { ...prev, [key]: safeValue } : prev);
    setCustomScoringInputs(prev => ({ ...prev, [key]: safeValue.toString() }));
  };

  const resetManualPoints = () => {
    setResults(prev => prev.map(r => ({ ...r, manualPoints: undefined })));
    setEditingPointsId(null);
  };

  const hasManualOverrides = results.some(r => r.manualPoints !== undefined);

  const handleSaveGame = () => {
    if (!setupData || !customScoring) return;

    const currentUser = useAuthStore.getState().user;
    const now = new Date().toISOString();

    // Build legacy results for internal calculations
    const legacyResults: ParticipantResult[] = results.map(r => ({
      playerId: r.playerId,
      teamId: playerTeams[r.playerId],
      rank: r.rank,
      points: getPointsForPlayer(r.playerId, r.rank, r.manualPoints)
    }));

    // Convert to new results format
    const newResults: GameSessionResults = convertToNewResultsFormat(legacyResults, setupData.type);

    // Build enriched participants array
    const enrichedParticipants: GameSessionParticipant[] = selectedPlayers.map(playerId => {
      const player = tournament.players.find(p => p.id === playerId);
      return {
        playerId,
        userId: player?.userId,
        name: player?.name || 'Unknown',
        teamId: playerTeams[playerId],
      };
    });

    // Extract user IDs for queries
    const participantUserIds = enrichedParticipants
      .map(p => p.userId)
      .filter((uid): uid is string => !!uid);

    // Extract winner user IDs (rank 1 players)
    const winnerUserIds = enrichedParticipants
      .filter(p => {
        const result = legacyResults.find(r => r.playerId === p.playerId);
        return result?.rank === 1;
      })
      .map(p => p.userId)
      .filter((uid): uid is string => !!uid);

    // Build the new session object
    const sessionData: Partial<GameSession> = {
      ownerId: currentUser?.uid || '',
      gameName: setupData.name,
      gameId: setupData.gameId,
      gameThumbnail: setupData.meta?.thumbnail,
      gameSourceIds: setupData.sourceIds,
      gameMeta: setupData.meta,
      preset: setupData.preset,
      scoringRules: customScoring,
      status: 'complete',
      participants: enrichedParticipants,
      participantUserIds,
      winnerUserIds,
      teams: setupData.type === 'team' ? Object.entries(playerTeams).reduce((acc) => {
        // For team games, team assignments are preserved in participants
        return acc;
      }, [] as any[]) : undefined,
      results: newResults,
      playedAt: isEditMode && existingSession
        ? existingSession.playedAt || existingSession.datePlayed || now
        : now,
      tournamentId: tournament.id,
      // Legacy compatibility
      gameType: setupData.type,
      datePlayed: isEditMode && existingSession
        ? existingSession.playedAt || existingSession.datePlayed || now
        : now,
    };

    if (isEditMode && existingSession) {
      updateGameSession(existingSession.id, sessionData);
    } else {
      addGameSession({
        ...sessionData,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      } as GameSession);
    }
    navigate(-1);
  };

  return (
    <div className="min-h-screen pb-20 page-frame">
      <SEO 
        path={sessionId ? `/edit-game/${sessionId}` : '/add-game'}
        title={sessionId ? 'Edit game session' : 'Add game session'}
        description="Log a new BoardBrawl game session, set scoring, and rank players or teams."
      />
      
      <header className="sticky top-0 z-20 backdrop-blur-sm bg-paper/95 border-b border-gold-2 px-4 py-4 sm:py-6">
        <div className="max-w-xl mx-auto flex items-center relative">
          {/* Profile icon - positioned inline with header content */}
          <div className="absolute right-0 top-0">
            <AuthMenu />
          </div>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1 as any) : navigate(-1)}
            className="mr-4 -ml-2 text-muted p-2 rounded-[4px] transition-all hover:text-ink hover:bg-gold-2/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            aria-label="Go back"
          >
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-ink engraved tracking-tight">
              {isEditMode ? "Edit Game" : "Record New Session"}
            </h1>
          </div>
        </div>
      </header>

      <main id="main-content" role="main" className="max-w-xl mx-auto px-4 py-8 sm:py-12">
        <nav className="mb-8" aria-label="Progress">
          <ol className="flex items-center justify-center space-x-4">
            {[1, 2, 3].map((s) => (
              <li key={s} className="flex items-center">
                <span className={cn(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold",
                  step === s ? "border-gold text-gold" : "border-border-2 text-muted"
                )}>
                  {s}
                </span>
                {s < 3 && <div className="w-8 h-px bg-border-2 mx-2" />}
              </li>
            ))}
          </ol>
        </nav>

        {step === 1 && (
          <form onSubmit={handleSubmit(onSubmitStep1)} className="space-y-10 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-8">
              <div>
                <label htmlFor="gameName" className="block text-base font-bold text-muted engraved mb-3 px-1">Game Name</label>
                <GameInput
                  value={watchName}
                  onChange={(val) => {
                    setValue('name', val);
                    setValue('gameId', undefined);
                    setValue('sourceIds', undefined);
                    setValue('meta', undefined);
                  }}
                  onSelect={(choice) => {
                    setValue('name', choice.name);
                    setValue('gameId', choice.gameId);
                    setValue('sourceIds', choice.sourceIds);
                    setValue('meta', choice.meta);
                  }}
                  selectedGame={
                    watchName && (watchGameId || watchGameSourceIds?.bgg)
                      ? {
                          name: watchName,
                          gameId: watchGameId,
                          sourceIds: watchGameSourceIds,
                          meta: watchGameMeta,
                        }
                      : null
                  }
                  placeholder="e.g. Catan"
                  aria-label="Game name"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'gameName-error' : undefined}
                  ownedGameIds={ownedGameIds}
                />
                {errors.name && <p id="gameName-error" className="text-sm sm:text-base text-red-500 mt-3 engraved" role="alert">{errors.name.message}</p>}
              </div>

              <fieldset>
                <legend className="block text-base font-bold text-muted engraved mb-4 px-1">Game Type</legend>
                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 sm:gap-5">
                  <button 
                    type="button"
                    className={cn(
                      "card-medieval p-5 cursor-pointer transition-all group text-left",
                      watchType === 'ffa' ? "border-gold bg-white ring-1 ring-gold/20 shadow-soft" : "hover:border-gold-2 hover:translate-y-[-2px]"
                    )}
                    onClick={() => setValue('type', 'ffa')}
                    aria-pressed={watchType === 'ffa'}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <User className={cn("w-6 h-6", watchType === 'ffa' ? "text-gold" : "text-muted")} aria-hidden="true" />
                      <div className={cn("font-bold engraved text-lg", watchType === 'ffa' ? "text-gold" : "text-ink")}>Free-for-all</div>
                    </div>
                    <div className="text-base text-muted engraved italic mt-1.5">Everyone for themselves</div>
                  </button>
                  <button 
                    type="button"
                    className={cn(
                      "card-medieval p-5 cursor-pointer transition-all group text-left",
                      watchType === 'team' ? "border-gold bg-white ring-1 ring-gold/20 shadow-soft" : "hover:border-gold-2 hover:translate-y-[-2px]"
                    )}
                    onClick={() => setValue('type', 'team')}
                    aria-pressed={watchType === 'team'}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Users className={cn("w-6 h-6", watchType === 'team' ? "text-gold" : "text-muted")} aria-hidden="true" />
                      <div className={cn("font-bold engraved text-lg", watchType === 'team' ? "text-gold" : "text-ink")}>Teams</div>
                    </div>
                    <div className="text-base text-muted engraved italic mt-1.5">Shared glory by team</div>
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend className="block text-base font-bold text-muted engraved mb-4 px-1">Game Length</legend>
                <div className="grid gap-4">
                  {(['quick', 'medium', 'big'] as const).map(key => {
                    const preset = GAME_PRESETS[key];
                    const isSelected = watchPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setValue('preset', key);
                          setCustomScoring(preset.defaultScoring);
                        }}
                        className={cn(
                          "card-medieval p-5 cursor-pointer transition-all flex justify-between items-center group text-left",
                          isSelected ? "border-gold bg-white ring-1 ring-gold/20 shadow-soft" : "hover:border-gold-2 hover:translate-y-[-2px]"
                        )}
                        aria-pressed={isSelected}
                      >
                        <div>
                          <div className={cn("font-bold engraved text-lg", isSelected ? "text-gold" : "text-ink")}>{preset.label}</div>
                          <div className="text-base text-muted engraved flex items-center mt-1.5 font-medium">
                            <Clock className="w-4.5 h-4.5 mr-2 opacity-60" aria-hidden="true" /> {preset.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {customScoring && (
                <section aria-labelledby="customize-scoring-heading" className="space-y-3 sm:space-y-4">
                  <legend className="block text-base font-bold text-muted engraved mb-4 px-1">Customize Scoring (optional)</legend>
                  <div className="card-medieval p-6 sm:p-7 bg-white/80 border-gold-2/40">
                    <div className="grid grid-cols-4 gap-3 sm:gap-5">
                      {[
                        { label: '1st', key: 'first' },
                        { label: '2nd', key: 'second' },
                        { label: '3rd', key: 'third' },
                        { label: 'Other', key: 'others' }
                      ].map(rule => (
                        <div key={rule.key}>
                          <label htmlFor={`scoring-${rule.key}`} className="text-xs sm:text-sm font-bold text-muted engraved block mb-2 text-center">{rule.label}</label>
                          <Input 
                            id={`scoring-${rule.key}`}
                            type="number" 
                            min={0}
                            className="h-10 sm:h-11 text-center font-bold tabular border-gold-2/30 text-base sm:text-lg" 
                            value={customScoringInputs[rule.key as keyof ScoringRules] ?? ''} 
                            onChange={(e) => handleScoringInputChange(rule.key as keyof ScoringRules, e.target.value)} 
                            onBlur={() => handleScoringInputBlur(rule.key as keyof ScoringRules)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <Button type="submit" variant="primary" className="w-full py-6 sm:py-7 text-lg">
              Next: Players
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-3">
              <p className="text-base text-muted engraved italic">
                Choose the players who played this game.
              </p>
              <div className="divider-line !my-6 opacity-30" aria-hidden="true" />
            </div>
            
            <div className="grid gap-4" role="group" aria-label="Player selection">
              {tournament.players.map(player => {
                const isSelected = selectedPlayers.includes(player.id);
                const teamId = playerTeams[player.id];

                return (
                  <div 
                    key={player.id}
                    className={cn(
                      "card-medieval p-5 transition-all flex items-center justify-between group cursor-pointer",
                      isSelected ? "border-gold bg-gold-2/5 ring-1 ring-gold/20" : "hover:border-gold-2 hover:translate-y-[-2px]"
                    )}
                    onClick={() => togglePlayer(player.id)}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && togglePlayer(player.id)}
                  >
                    <div className="flex items-center flex-1">
                      <div className={cn(
                        "w-6 h-6 rounded border border-gold-2/40 mr-4 flex items-center justify-center transition-all",
                        isSelected ? "bg-gold border-gold" : "bg-white"
                      )} aria-hidden="true">
                        {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <span className="font-bold text-ink engraved text-lg">{player.name}</span>
                    </div>

                    {isSelected && setupData?.type === 'team' && (
                      <div className="flex items-center gap-4 border-l border-gold-2/20 pl-5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-sm font-bold text-muted engraved hidden sm:inline">Team</span>
                        <TeamIconSelector value={teamId} onChange={(icon) => assignTeam(player.id, icon)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {teamError && (
              <div className="flex items-center justify-center gap-2 text-base text-red-500 engraved" role="alert" aria-live="assertive">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
                {teamError}
              </div>
            )}
            
            <div className="pt-8">
              <Button onClick={onSubmitStep2} variant="primary" className="w-full py-7 text-lg" disabled={selectedPlayers.length < 2}>
                Next: Game Results
              </Button>
            </div>
          </div>
        )}

        {step === 3 && setupData && (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="card-medieval p-2 sm:p-2 border-dashed border-gold-2/40 text-center">
              <p className="text-sm sm:text-base text-muted engraved italic">
                {setupData.type === 'team' 
                  ? "Drag to order. All team members receive the same points."
                  : "Drag to order the players from the winner down."
                }
              </p>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={results.map(r => r.playerId)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-5 min-h-[100px]" aria-label="Rank results">
                  {results.map((result, index) => {
                    const player = tournament.players.find(p => p.id === result.playerId);
                    const points = getPointsForPlayer(result.playerId, index + 1, result.manualPoints);
                    const isEditing = editingPointsId === result.playerId;
                    const teamId = playerTeams[result.playerId];

                    return (
                      <SortableResultItem
                        key={result.playerId}
                        id={result.playerId}
                        index={index}
                        playerName={player?.name ?? 'Unknown'}
                        teamId={teamId}
                        points={points}
                        hasManualPoints={result.manualPoints !== undefined}
                        isEditing={isEditing}
                        onEditPoints={() => setEditingPointsId(result.playerId)}
                        onSavePoints={(value) => updateManualPoints(result.playerId, value)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 sm:gap-4 mt-6">
              {hasManualOverrides && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 px-4 text-sm font-bold text-muted hover:text-ink"
                  onClick={resetManualPoints}
                >
                  Reset Scores
                </Button>
              )}
              <Button onClick={handleSaveGame} variant="primary" className="h-11 sm:h-12 px-5 sm:px-7 text-base font-bold shadow-main">
                {isEditMode ? "Update Game" : "Save Game"}
              </Button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
