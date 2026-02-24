import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { User, ArrowLeft, Loader2, Hash, Trophy, Gamepad2, Package, Star, Crown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { ShelfView } from '../components/library';
import { lookupUserByCode, getUserProfile, loadPublicLibrariesForUser, loadPublicLibrary } from '../services/librarySync';
import { loadUserStats } from '../services/statsService';
import { useAuthStore } from '../store/authStore';
import type { Library, ShelfConfig, LibraryGameView } from '../types/library';
import type { UserStats } from '../types/stats';

type LoadState = 'loading' | 'success' | 'not-found' | 'error';

export default function UserProfilePage() {
  const { usercode } = useParams<{ usercode: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const authInitialized = useAuthStore((state) => state.initialized);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [myLibrary, setMyLibrary] = useState<Library | null>(null);
  const [myLibraryItems, setMyLibraryItems] = useState<LibraryGameView[]>([]);
  const [myLibraryShelf, setMyLibraryShelf] = useState<ShelfConfig | null>(null);

  // Load profile data
  useEffect(() => {
    async function loadData() {
      // Wait for auth to initialize
      if (!authInitialized) return;

      if (!usercode) {
        setLoadState('not-found');
        return;
      }

      setLoadState('loading');

      try {
        // Lookup user by code
        const userId = await lookupUserByCode(usercode);
        if (!userId) {
          setLoadState('not-found');
          return;
        }

        // Get user profile for display name
        const profile = await getUserProfile(userId);
        setDisplayName(profile?.displayName || `Player #${usercode}`);

        // Load user stats
        const userStats = await loadUserStats(userId);
        setStats(userStats);

        // Load public libraries and find "My Library"
        const publicLibraries = await loadPublicLibrariesForUser(userId);
        const myLib = publicLibraries.find(lib => lib.systemKey === 'my');

        // If My Library is public, load its full data including shelf
        if (myLib) {
          const libraryData = await loadPublicLibrary(userId, myLib.id);
          if (libraryData.library) {
            setMyLibrary(libraryData.library);
            setMyLibraryItems(libraryData.items);
            setMyLibraryShelf(libraryData.shelf);
          }
        }

        setLoadState('success');
      } catch (error) {
        console.error('Failed to load user profile:', error);
        setLoadState('error');
      }
    }

    loadData();
  }, [usercode, user, authInitialized]);

  // Render based on load state
  if (loadState === 'loading' || !authInitialized) {
    return (
      <div className="min-h-screen page-frame flex items-center justify-center">
        <SEO
          path={`/u/${usercode}`}
          title="Loading Profile | BoardBrawl"
          description="View a player profile on BoardBrawl."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gold mx-auto mb-4 animate-spin" />
          <p className="text-muted">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (loadState === 'not-found') {
    return (
      <div className="min-h-screen page-frame">
        <SEO
          path={`/u/${usercode}`}
          title="Profile Not Found | BoardBrawl"
          description="This profile could not be found."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="card-medieval p-12">
            <User className="w-16 h-16 text-muted mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink engraved mb-2">Player Not Found</h1>
            <p className="text-muted mb-6">
              This player doesn't exist or the link may be incorrect.
            </p>
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to BoardBrawl
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen page-frame">
        <SEO
          path={`/u/${usercode}`}
          title="Error | BoardBrawl"
          description="An error occurred while loading this profile."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="card-medieval p-12">
            <User className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink engraved mb-2">Something Went Wrong</h1>
            <p className="text-muted mb-6">
              We couldn't load this profile. Please try again later.
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success - show profile
  return (
    <div className="min-h-screen page-frame">
      <SEO
        path={`/u/${usercode}`}
        title={`${displayName} | BoardBrawl`}
        description={`View ${displayName}'s profile and public game libraries on BoardBrawl.`}
      />

      {/* Header */}
      <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 mb-8 relative">
        {/* Profile icon - positioned inline with header content */}
        <div className="absolute right-4 sm:right-6 lg:right-8 top-4 sm:top-6">
          <AuthMenu />
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="mt-8 text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-gold/15 border-2 border-gold-2/60 flex items-center justify-center mb-4">
            <User className="w-12 h-12 text-gold" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink engraved">
            {displayName}
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-2 text-muted">
            <Hash className="w-4 h-4" />
            <span>{usercode}</span>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      {stats && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 space-y-4">
          {/* Row 1: Numeric stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card-medieval p-4 text-center">
              <div className="flex justify-center mb-2">
                <Gamepad2 className="w-5 h-5 text-gold" />
              </div>
              <div className="text-2xl font-bold text-ink">{stats.gamesPlayed}</div>
              <div className="text-sm text-muted">Games Played</div>
            </div>
            <div className="card-medieval p-4 text-center">
              <div className="flex justify-center mb-2">
                <Trophy className="w-5 h-5 text-gold" />
              </div>
              <div className="text-2xl font-bold text-ink">{stats.gamesWon}</div>
              <div className="text-sm text-muted">Games Won</div>
            </div>
            <div className="card-medieval p-4 text-center">
              <div className="flex justify-center mb-2">
                <Package className="w-5 h-5 text-gold" />
              </div>
              <div className="text-2xl font-bold text-ink">{stats.gamesOwned}</div>
              <div className="text-sm text-muted">Games Owned</div>
            </div>
            <div className="card-medieval p-4 text-center">
              <div className="flex justify-center mb-2">
                <Crown className="w-5 h-5 text-gold" />
              </div>
              <div className="text-2xl font-bold text-ink">{stats.tournamentsPlayed}</div>
              <div className="text-sm text-muted">Tournaments</div>
            </div>
          </div>
          {/* Row 2: Most Played */}
          <div className="flex justify-center">
            <div className="card-medieval p-4 text-center w-fit max-w-full">
              <div className="flex justify-center mb-2">
                <Star className="w-5 h-5 text-gold" />
              </div>
              <div className="text-2xl font-bold text-ink">
                {stats.mostPlayedGameName || '-'}
              </div>
              <div className="text-sm text-muted">Most Played</div>
            </div>
          </div>
        </section>
      )}

      {/* My Library Shelf View - only shown if library is public */}
      {myLibrary && myLibraryShelf && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <ShelfView
            libraryId={myLibrary.id}
            shelf={myLibraryShelf}
            items={myLibraryItems}
            isReadOnly={true}
            hideUnplacedPanel={true}
          />
        </main>
      )}

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center border-t border-border-2">
        <p className="text-sm text-muted">
          <Link to="/" className="text-gold hover:underline">
            BoardBrawl
          </Link>
          {' '}— The Ultimate Game Night Scorekeeper
        </p>
      </footer>
    </div>
  );
}
