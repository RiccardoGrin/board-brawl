import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, Loader2, Lock, User, ExternalLink } from 'lucide-react';
import { Button } from '../components/ui/button';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { LibraryItemCard, LibraryFiltersBar } from '../components/library';
import { loadPublicLibrary, lookupUserByCode, getUserProfile } from '../services/librarySync';
import type { Library, LibraryGameView, LibraryFilters, LibrarySort } from '../types/library';

// Apply filters (same logic as store but standalone for public view)
const applyFilters = (items: LibraryGameView[], filters: LibraryFilters): LibraryGameView[] => {
  return items.filter((item) => {
    if (filters.favorite && !item.favorite) return false;
    if (filters.unplayed && (item.playCount ?? 0) > 0) return false;
    if (filters.forTrade && !item.forTrade) return false;
    if (filters.forSale && !item.forSale) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const nameMatch = item.gameName.toLowerCase().includes(search);
      const notesMatch = item.notes?.toLowerCase().includes(search);
      const tagsMatch = item.tags?.some((tag) => tag.toLowerCase().includes(search));
      if (!nameMatch && !notesMatch && !tagsMatch) return false;
    }
    return true;
  });
};

const applySort = (items: LibraryGameView[], sort: LibrarySort): LibraryGameView[] => {
  const sorted = [...items];
  const { field, direction } = sort;
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (field) {
      case 'name':
        return multiplier * a.gameName.localeCompare(b.gameName);
      case 'rating':
        return multiplier * ((a.myRating ?? 0) - (b.myRating ?? 0));
      case 'playCount':
        return multiplier * ((a.playCount ?? 0) - (b.playCount ?? 0));
      case 'dateAdded':
        return multiplier * (new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
      case 'lastPlayed':
        // Using addedAt as fallback
        return multiplier * (new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
      default:
        return 0;
    }
  });

  return sorted;
};

type LoadState = 'loading' | 'success' | 'not-found' | 'private' | 'error';

export default function PublicLibraryPage() {
  const { usercode, libraryId } = useParams<{ usercode: string; libraryId: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [library, setLibrary] = useState<Library | null>(null);
  const [items, setItems] = useState<LibraryGameView[]>([]);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [sort, setSort] = useState<LibrarySort>({ field: 'name', direction: 'asc' });

  // Load library data
  useEffect(() => {
    async function loadData() {
      if (!usercode || !libraryId) {
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
        setOwnerName(profile?.displayName || `Player #${usercode}`);

        // Load library using new function
        const { library: lib, items: libraryItems } = await loadPublicLibrary(userId, libraryId);

        if (!lib) {
          setLoadState('not-found');
          return;
        }

        if (lib.visibility !== 'public') {
          setLoadState('private');
          return;
        }

        setLibrary(lib);
        setItems(libraryItems);
        setLoadState('success');
      } catch (error) {
        console.error('Failed to load public library:', error);
        setLoadState('error');
      }
    }

    loadData();
  }, [usercode, libraryId]);

  // Apply filters and sort
  const filteredItems = useMemo(() => {
    const filtered = applyFilters(items, filters);
    return applySort(filtered, sort);
  }, [items, filters, sort]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = items.length;
    const played = items.reduce((sum, i) => sum + (i.playCount ?? 0), 0);
    const avgRating =
      items.filter((i) => i.myRating !== undefined).length > 0
        ? items
            .filter((i) => i.myRating !== undefined)
            .reduce((sum, i) => sum + (i.myRating ?? 0), 0) /
          items.filter((i) => i.myRating !== undefined).length
        : null;

    return { total, played, avgRating };
  }, [items]);

  // Render based on load state
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen page-frame flex items-center justify-center">
        <SEO
          path={`/u/${usercode}/library/${libraryId}`}
          title="Loading Library | BoardBrawl"
          description="View a shared board game collection on BoardBrawl."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gold mx-auto mb-4 animate-spin" />
          <p className="text-muted">Loading library...</p>
        </div>
      </div>
    );
  }

  if (loadState === 'not-found') {
    return (
      <div className="min-h-screen page-frame">
        <SEO
          path={`/u/${usercode}/library/${libraryId}`}
          title="Library Not Found | BoardBrawl"
          description="This library could not be found."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="card-medieval p-12">
            <BookOpen className="w-16 h-16 text-muted mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink engraved mb-2">Library Not Found</h1>
            <p className="text-muted mb-6">
              This library doesn't exist or the link may be incorrect.
            </p>
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to BoardBrawl
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'private') {
    return (
      <div className="min-h-screen page-frame">
        <SEO
          path={`/u/${usercode}/library/${libraryId}`}
          title="Private Library | BoardBrawl"
          description="This library is private."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="card-medieval p-12">
            <Lock className="w-16 h-16 text-muted mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink engraved mb-2">Private Library</h1>
            <p className="text-muted mb-6">This library is set to private and cannot be viewed.</p>
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
          path={`/u/${usercode}/library/${libraryId}`}
          title="Error | BoardBrawl"
          description="An error occurred while loading this library."
        />
        <div className="fixed top-4 right-4 sm:right-8 z-[100]">
          <AuthMenu />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="card-medieval p-12">
            <BookOpen className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-ink engraved mb-2">Something Went Wrong</h1>
            <p className="text-muted mb-6">
              We couldn't load this library. Please try again later.
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success - show library
  return (
    <div className="min-h-screen page-frame">
      <SEO
        path={`/u/${usercode}/library/${libraryId}`}
        title={`${library?.name || 'Library'} by ${ownerName} | BoardBrawl`}
        description={`View ${ownerName}'s board game collection with ${items.length} games on BoardBrawl.`}
      />

      <div className="fixed top-4 right-4 sm:right-8 z-[100]">
        <AuthMenu />
      </div>

      {/* Header */}
      <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 mb-8">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-muted hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            BoardBrawl
          </Button>
          <Link
            to="/"
            className="text-sm text-gold hover:text-gold-dark transition-colors flex items-center gap-1"
          >
            Create your own library
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BookOpen className="w-8 h-8 text-gold" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink engraved">
            {library?.name || 'Game Library'}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 text-muted">
            <User className="w-4 h-4" />
            <span>Curated by {ownerName}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-center">
          <div>
            <div className="text-2xl font-bold text-ink">{stats.total}</div>
            <div className="text-xs text-muted">Games</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-ink">{stats.played}</div>
            <div className="text-xs text-muted">Total Plays</div>
          </div>
          {stats.avgRating !== null && (
            <div>
              <div className="text-2xl font-bold text-ink">{stats.avgRating.toFixed(1)}</div>
              <div className="text-xs text-muted">Avg Rating</div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="space-y-6">
          {/* Filters */}
          <LibraryFiltersBar
            filters={filters}
            sort={sort}
            onFiltersChange={setFilters}
            onSortChange={setSort}
            totalCount={items.length}
            filteredCount={filteredItems.length}
          />

          {/* Game List */}
          {filteredItems.length === 0 ? (
            <div className="card-medieval p-12 text-center">
              <BookOpen className="w-12 h-12 text-muted mx-auto mb-4" />
              {items.length === 0 ? (
                <p className="text-muted">This library is empty.</p>
              ) : (
                <p className="text-muted">No games match your filters.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredItems.map((item) => (
                <LibraryItemCard
                  key={item.gameId}
                  item={item}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onToggleFavorite={() => {}}
                  readOnly
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center border-t border-border-2">
        <p className="text-sm text-muted">
          Powered by{' '}
          <Link to="/" className="text-gold hover:underline">
            BoardBrawl
          </Link>{' '}
          — The Ultimate Game Night Scorekeeper
        </p>
      </footer>
    </div>
  );
}
