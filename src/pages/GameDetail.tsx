import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { useTournamentStore } from '../store/tournamentStore';
import { Button } from '../components/ui/button';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { EditItemModal } from '../components/library/EditItemModal';
import {
  GameHeader,
  GameMetadata,
  UserGamePanel,
  GameSessionList,
} from '../components/game';
import { loadGameStats } from '../services/statsService';
import {
  fetchBggGameById,
  upsertBggResults,
  isGameStale,
  refreshGameIfStale,
  type GameRecord,
} from '../services/gameSearch';
import type { UserGame, LibraryGameView } from '../types/library';
import type { UserGameStats } from '../types/stats';

export default function GameDetail() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);

  // Library store for UserGame data
  const userGames = useLibraryStore((state) => state.userGames);
  const updateUserGame = useLibraryStore((state) => state.updateUserGame);

  // Tournament store for sessions
  const gameSessions = useTournamentStore((state) => state.gameSessions);

  // Local state
  const [gameRecord, setGameRecord] = useState<GameRecord | null>(null);
  const [gameStats, setGameStats] = useState<UserGameStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<LibraryGameView | null>(null);

  // Get UserGame from store
  const userGame: UserGame | undefined = gameId ? userGames[gameId] : undefined;

  // Filter sessions for this game (sessions where user participated)
  const sessionsForGame = useMemo(() => {
    if (!gameId || !user) return [];
    return Object.values(gameSessions)
      .filter(
        (session) =>
          session.gameId === gameId &&
          session.status === 'complete' &&
          session.participantUserIds?.includes(user.uid)
      )
      .sort((a, b) => {
        const dateA = new Date(a.playedAt || a.createdAt).getTime();
        const dateB = new Date(b.playedAt || b.createdAt).getTime();
        return dateB - dateA; // Most recent first
      });
  }, [gameId, gameSessions, user]);

  // Compute local stats from sessions (provides immediate feedback without waiting for Cloud Function)
  const localGameStats = useMemo((): UserGameStats | null => {
    if (!gameId || !user || sessionsForGame.length === 0) return null;

    const playCount = sessionsForGame.length;
    const winCount = sessionsForGame.filter(
      (session) => session.winnerUserIds?.includes(user.uid)
    ).length;

    const sortedByDate = [...sessionsForGame].sort((a, b) => {
      const dateA = new Date(a.playedAt || a.createdAt).getTime();
      const dateB = new Date(b.playedAt || b.createdAt).getTime();
      return dateA - dateB; // Oldest first for firstPlayed
    });

    return {
      gameId,
      gameName: sessionsForGame[0]?.gameName || 'Unknown Game',
      gameThumbnail: sessionsForGame[0]?.gameThumbnail,
      playCount,
      winCount,
      lastPlayed: sessionsForGame[0]?.playedAt || sessionsForGame[0]?.createdAt,
      firstPlayed: sortedByDate[0]?.playedAt || sortedByDate[0]?.createdAt,
    };
  }, [gameId, user, sessionsForGame]);

  // Merge Firestore stats with local stats (use higher values to handle race conditions)
  const mergedGameStats = useMemo((): UserGameStats | null => {
    if (!gameStats && !localGameStats) return null;
    if (!gameStats) return localGameStats;
    if (!localGameStats) return gameStats;

    return {
      ...gameStats,
      playCount: Math.max(gameStats.playCount, localGameStats.playCount),
      winCount: Math.max(gameStats.winCount, localGameStats.winCount),
      lastPlayed: gameStats.lastPlayed && localGameStats.lastPlayed
        ? new Date(gameStats.lastPlayed) > new Date(localGameStats.lastPlayed)
          ? gameStats.lastPlayed
          : localGameStats.lastPlayed
        : gameStats.lastPlayed || localGameStats.lastPlayed,
    };
  }, [gameStats, localGameStats]);

  // Fetch game data
  useEffect(() => {
    if (!gameId || !initialized) return;

    const fetchGameData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Try to fetch GameRecord from Firestore cache
        const gameDocRef = doc(db, 'games', gameId);
        const gameDocSnap = await getDoc(gameDocRef);

        let record: GameRecord | null = null;

        if (gameDocSnap.exists()) {
          record = { ...(gameDocSnap.data() as GameRecord), gameId };

          // Check if stale and refresh in background
          if (isGameStale(record) && record.sourceIds?.bgg) {
            refreshGameIfStale(record.sourceIds.bgg).then((refreshed) => {
              if (refreshed) setGameRecord(refreshed);
            });
          }
        } else {
          // 2. If not found, check if gameId might be a BGG ID and try to fetch
          if (/^\d+$/.test(gameId)) {
            const bggResult = await fetchBggGameById(gameId);
            if (bggResult) {
              const upserted = await upsertBggResults([bggResult]);
              if (upserted.length > 0) {
                record = upserted[0];
              }
            }
          }
        }

        if (!record) {
          setError('Game not found');
          setIsLoading(false);
          return;
        }

        setGameRecord(record);

        // 3. Fetch game stats if authenticated
        if (user) {
          const stats = await loadGameStats(user.uid, gameId);
          setGameStats(stats);
        }
      } catch (err) {
        console.error('Failed to fetch game data:', err);
        setError('Failed to load game data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGameData();
  }, [gameId, initialized, user]);

  // Handle edit save
  const handleSaveItem = (id: string, updates: Partial<LibraryGameView>) => {
    updateUserGame(id, updates);
    setEditingItem(null);
  };

  // Create LibraryGameView for EditItemModal
  const createEditableItem = (): LibraryGameView | null => {
    if (!userGame || !gameId) return null;
    return {
      gameId,
      gameName: userGame.gameName,
      gameThumbnail: userGame.gameThumbnail,
      gameYear: userGame.gameYear,
      status: userGame.status,
      myRating: userGame.myRating,
      favorite: userGame.favorite,
      notes: userGame.notes,
      tags: userGame.tags,
      forTrade: userGame.forTrade,
      forSale: userGame.forSale,
      playCount: userGame.playCount,
      condition: userGame.condition,
      language: userGame.language,
      edition: userGame.edition,
      boxSizeClass: userGame.boxSizeClass,
      boxWidthMm: userGame.boxWidthMm,
      boxHeightMm: userGame.boxHeightMm,
      boxDepthMm: userGame.boxDepthMm,
      libraryId: '', // Not needed for editing
      addedAt: userGame.createdAt,
      createdAt: userGame.createdAt,
      updatedAt: userGame.updatedAt,
    };
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen page-frame">
        <SEO path={`/games/${gameId || ''}`} title="Loading... | BoardBrawl" />
        <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative">
            <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6 z-[60]">
              <AuthMenu />
            </div>
            <div className="flex items-center gap-4 pr-12">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="-ml-2 text-muted h-10 w-10 shrink-0 rounded-[4px] hover:bg-gold-2/20 hover:text-ink"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="h-8 w-48 bg-gold-2/20 rounded animate-pulse" />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse space-y-6">
            <div className="h-64 bg-gold-2/20 rounded-lg" />
            <div className="h-8 w-2/3 bg-gold-2/20 rounded" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-gold-2/20 rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error || !gameRecord) {
    return (
      <div className="min-h-screen page-frame">
        <SEO path={`/games/${gameId || ''}`} title="Game Not Found | BoardBrawl" />
        <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative">
            <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6 z-[60]">
              <AuthMenu />
            </div>
            <div className="flex items-center gap-4 pr-12">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="-ml-2 text-muted h-10 w-10 shrink-0 rounded-[4px] hover:bg-gold-2/20 hover:text-ink"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-2xl font-bold text-ink engraved">Game Not Found</h1>
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="card-medieval p-12">
            <AlertCircle className="w-12 h-12 text-gold-2 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-ink engraved mb-2">Game Not Found</h2>
            <p className="text-muted mb-6">
              We couldn't find this game. It may have been removed or the link is incorrect.
            </p>
            <Button variant="primary" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-frame">
      <SEO
        path={`/games/${gameId || ''}`}
        title={`${gameRecord.primaryName} | BoardBrawl`}
        description={`View details for ${gameRecord.primaryName}${gameRecord.year ? ` (${gameRecord.year})` : ''}`}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-gold-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 relative">
          <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6 z-[60]">
            <AuthMenu />
          </div>

          <div className="flex items-center gap-4 pr-12">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="-ml-2 text-muted h-10 w-10 shrink-0 rounded-[4px] hover:bg-gold-2/20 hover:text-ink"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink engraved truncate">
                {gameRecord.primaryName}
              </h1>
              {gameRecord.year && (
                <p className="text-muted text-base">({gameRecord.year})</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Game Header with Image and Quick Info */}
        <GameHeader game={gameRecord} userRating={userGame?.myRating} showUserRating={!!user} />

        {/* User Game Panel (authenticated only) */}
        {user && (
          userGame ? (
            <UserGamePanel
              userGame={userGame}
              gameStats={mergedGameStats}
              onEditClick={() => setEditingItem(createEditableItem())}
              onLogPlayClick={() => navigate(`/add-game?gameId=${gameId}`)}
            />
          ) : (
            <div className="card-medieval p-6">
              <p className="text-muted text-center mb-4">
                This game is not in your collection yet.
              </p>
              <div className="flex justify-center">
                <Button
                  variant="primary"
                  onClick={() => navigate(`/add-game?gameId=${gameId}`)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Log a Play
                </Button>
              </div>
            </div>
          )
        )}

        {/* Game Metadata */}
        <GameMetadata game={gameRecord} />

        {/* Session History (authenticated only) */}
        {user && (
          <GameSessionList
            sessions={sessionsForGame}
            onLogPlayClick={() => navigate(`/add-game?gameId=${gameId}`)}
          />
        )}
      </main>

      {/* Edit Modal */}
      <EditItemModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        onSave={handleSaveItem}
      />
    </div>
  );
}
