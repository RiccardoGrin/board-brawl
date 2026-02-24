import { useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, Plus, ArrowUpDown, Heart, Dice5, ArrowRightLeft, DollarSign, MoreHorizontal, List, LayoutGrid, Camera } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/button';
import type { LibraryFilters, LibrarySort, LibrarySortField, LibraryViewMode } from '../../types/library';

interface LibraryFiltersProps {
  filters: LibraryFilters;
  sort: LibrarySort;
  onFiltersChange: (filters: LibraryFilters) => void;
  onSortChange: (sort: LibrarySort) => void;
  totalCount: number;
  filteredCount: number;
  onAddGame?: () => void;
  onImportFromPhoto?: () => void;
  hideAddButton?: boolean;
  gameCount?: number;
  isAtGameCap?: boolean;
  showGameCapWarning?: boolean;
  libraryMenuContent?: React.ReactNode;
  isLibraryMenuOpen?: boolean;
  setIsLibraryMenuOpen?: (open: boolean) => void;
  // View mode (Phase 2)
  viewMode?: LibraryViewMode;
  onViewModeChange?: (viewMode: LibraryViewMode) => void;
}

const SORT_OPTIONS: { field: LibrarySortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'rating', label: 'Rating' },
  { field: 'playCount', label: 'Plays' },
  { field: 'dateAdded', label: 'Date Added' },
  { field: 'lastPlayed', label: 'Last Played' },
];

export function LibraryFiltersBar({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  totalCount,
  filteredCount,
  onAddGame,
  onImportFromPhoto,
  hideAddButton = false,
  gameCount = 0,
  isAtGameCap = false,
  showGameCapWarning = false,
  libraryMenuContent,
  isLibraryMenuOpen = false,
  setIsLibraryMenuOpen,
  viewMode = 'list',
  onViewModeChange,
}: LibraryFiltersProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  
  const hasActiveFilters = 
    filters.favorite ||
    filters.unplayed ||
    filters.forTrade ||
    filters.forSale ||
    filters.search;

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const handleToggleFilter = (key: 'favorite' | 'unplayed' | 'forTrade' | 'forSale') => {
    onFiltersChange({ ...filters, [key]: filters[key] ? undefined : true });
  };

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const handleSortFieldChange = (field: LibrarySortField) => {
    if (sort.field === field) {
      // Toggle direction
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      // New field, default to descending for rating/plays, ascending for name
      const defaultDirection = field === 'name' ? 'asc' : 'desc';
      onSortChange({ field, direction: defaultDirection });
    }
  };

  return (
    <div className="space-y-4">
      {/* Desktop Layout: Search left, Filters and Sort on right */}
      <div className="hidden sm:flex items-center gap-2">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search your library..."
            className="w-full h-11 pl-10 pr-4 rounded border border-border-2 bg-white/50 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-all"
          />
          {filters.search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Filters Dropdown */}
        <div className="relative">
          <button
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            className="h-11 px-3 rounded border border-border-2 bg-white/50 text-sm hover:border-gold-2 transition-colors flex items-center gap-2"
            aria-label="Filter options"
            aria-expanded={filterMenuOpen}
            aria-haspopup="true"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            <span>Filters</span>
            {(filters.favorite || filters.unplayed || filters.forTrade || filters.forSale) && (
              <span className="w-2 h-2 rounded-full bg-gold" aria-label="Active filters"></span>
            )}
          </button>
          
          {filterMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFilterMenuOpen(false)}
                aria-hidden="true"
              />
              <div 
                className="absolute right-0 top-full mt-1 z-50 card-medieval bg-white shadow-main p-2 w-48"
                role="menu"
                aria-label="Filter options"
              >
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.favorite}
                    onChange={() => handleToggleFilter('favorite')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only favorites"
                  />
                  <Heart className="w-4 h-4 text-red-500" aria-hidden="true" />
                  <span className="text-sm">Favorites</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.unplayed}
                    onChange={() => handleToggleFilter('unplayed')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only unplayed games"
                  />
                  <Dice5 className="w-4 h-4 text-muted" aria-hidden="true" />
                  <span className="text-sm">Unplayed</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.forTrade}
                    onChange={() => handleToggleFilter('forTrade')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games available for trade"
                  />
                  <ArrowRightLeft className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span className="text-sm">For Trade</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.forSale}
                    onChange={() => handleToggleFilter('forSale')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games available for sale"
                  />
                  <DollarSign className="w-4 h-4 text-green-600" aria-hidden="true" />
                  <span className="text-sm">For Sale</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortMenuOpen(!sortMenuOpen)}
            className="h-11 px-3 pr-2 rounded border border-border-2 bg-white/50 text-sm hover:border-gold-2 transition-colors flex items-center gap-2"
            aria-label={`Sort by ${SORT_OPTIONS.find(opt => opt.field === sort.field)?.label}`}
            aria-expanded={sortMenuOpen}
            aria-haspopup="true"
          >
            <ArrowUpDown className="w-4 h-4" aria-hidden="true" />
            <span>{SORT_OPTIONS.find(opt => opt.field === sort.field)?.label}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", sortMenuOpen && "rotate-180")} aria-hidden="true" />
          </button>
          
          {sortMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSortMenuOpen(false)}
                aria-hidden="true"
              />
              <div 
                className="absolute right-0 top-full mt-1 z-50 card-medieval bg-white shadow-main p-2 w-48"
                role="menu"
                aria-label="Sort options"
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.field}
                    onClick={() => {
                      handleSortFieldChange(opt.field);
                      setSortMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors text-left",
                      sort.field === opt.field && "bg-gold-2/10"
                    )}
                    role="menuitem"
                    aria-current={sort.field === opt.field ? 'true' : undefined}
                  >
                    <span className="text-sm">{opt.label}</span>
                    {sort.field === opt.field && (
                      <span className="text-sm" aria-label={sort.direction === 'asc' ? 'Ascending' : 'Descending'}>{sort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View Mode Toggle (Phase 2) */}
        {onViewModeChange && (
          <div className="flex items-center border border-border-2 rounded bg-white/50 overflow-hidden">
            <button
              onClick={() => onViewModeChange('list')}
              className={cn(
                "h-11 px-3 flex items-center gap-1.5 text-sm transition-colors",
                viewMode === 'list' 
                  ? "bg-gold/20 text-gold border-r border-gold/30" 
                  : "text-muted hover:text-ink hover:bg-gold/5 border-r border-border-2"
              )}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" aria-hidden="true" />
              <span>List</span>
            </button>
            <button
              onClick={() => onViewModeChange('shelf')}
              className={cn(
                "h-11 px-3 flex items-center gap-1.5 text-sm transition-colors",
                viewMode === 'shelf' 
                  ? "bg-gold/20 text-gold" 
                  : "text-muted hover:text-ink hover:bg-gold/5"
              )}
              aria-label="Shelf view"
              aria-pressed={viewMode === 'shelf'}
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              <span>Shelf</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Layout: Search left, Filters and Sort on right (all in one row) */}
      <div className="sm:hidden flex items-center gap-2">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search your library..."
            className="w-full h-11 pl-10 pr-4 rounded border border-border-2 bg-white/50 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-all"
          />
          {filters.search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters Dropdown */}
        <div className="relative">
          <button
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            className="h-11 px-3 rounded border border-border-2 bg-white/50 text-sm hover:border-gold-2 transition-colors flex items-center gap-2"
            aria-label="Filter options"
            aria-expanded={filterMenuOpen}
            aria-haspopup="true"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            {(filters.favorite || filters.unplayed || filters.forTrade || filters.forSale) && (
              <span className="w-2 h-2 rounded-full bg-gold" aria-label="Active filters"></span>
            )}
          </button>
          
          {filterMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFilterMenuOpen(false)}
                aria-hidden="true"
              />
              <div 
                className="absolute right-0 top-full mt-1 z-50 card-medieval bg-white shadow-main p-2 w-48"
                role="menu"
                aria-label="Filter options"
              >
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.favorite}
                    onChange={() => handleToggleFilter('favorite')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only favorites"
                  />
                  <Heart className="w-4 h-4 text-red-500" aria-hidden="true" />
                  <span className="text-sm">Favorites</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.unplayed}
                    onChange={() => handleToggleFilter('unplayed')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only unplayed games"
                  />
                  <Dice5 className="w-4 h-4 text-muted" aria-hidden="true" />
                  <span className="text-sm">Unplayed</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.forTrade}
                    onChange={() => handleToggleFilter('forTrade')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games available for trade"
                  />
                  <ArrowRightLeft className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span className="text-sm">For Trade</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.forSale}
                    onChange={() => handleToggleFilter('forSale')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games available for sale"
                  />
                  <DollarSign className="w-4 h-4 text-green-600" aria-hidden="true" />
                  <span className="text-sm">For Sale</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortMenuOpen(!sortMenuOpen)}
            className="h-11 px-3 rounded border border-border-2 bg-white/50 text-sm hover:border-gold-2 transition-colors flex items-center gap-2"
            aria-label={`Sort by ${SORT_OPTIONS.find(opt => opt.field === sort.field)?.label}`}
            aria-expanded={sortMenuOpen}
            aria-haspopup="true"
          >
            <ArrowUpDown className="w-4 h-4" aria-hidden="true" />
          </button>
          
          {sortMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSortMenuOpen(false)}
                aria-hidden="true"
              />
              <div 
                className="absolute right-0 top-full mt-1 z-50 card-medieval bg-white shadow-main p-2 w-48"
                role="menu"
                aria-label="Sort options"
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.field}
                    onClick={() => {
                      handleSortFieldChange(opt.field);
                      setSortMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors text-left",
                      sort.field === opt.field && "bg-gold-2/10"
                    )}
                    role="menuitem"
                    aria-current={sort.field === opt.field ? 'true' : undefined}
                  >
                    <span className="text-sm">{opt.label}</span>
                    {sort.field === opt.field && (
                      <span className="text-sm" aria-label={sort.direction === 'asc' ? 'Ascending' : 'Descending'}>{sort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View Mode Toggle (Phase 2) - Mobile */}
        {onViewModeChange && (
          <button
            onClick={() => onViewModeChange(viewMode === 'list' ? 'shelf' : 'list')}
            className={cn(
              "h-11 px-3 rounded border border-border-2 bg-white/50 text-sm hover:border-gold-2 transition-colors flex items-center gap-2",
              viewMode === 'shelf' && "border-gold bg-gold/10"
            )}
            aria-label={viewMode === 'list' ? 'Switch to shelf view' : 'Switch to list view'}
          >
            {viewMode === 'list' ? (
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            ) : (
              <List className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* Results Count with Actions */}
      <div className="flex items-center gap-3 group">
        {/* Add Game Buttons - Left */}
        {!hideAddButton && (
          <div className="flex items-center gap-2">
            {onAddGame && (
              <Button
                variant="primary"
                onClick={onAddGame}
                disabled={isAtGameCap}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Game
              </Button>
            )}
            {onImportFromPhoto && (
              <Button
                variant="secondary"
                onClick={onImportFromPhoto}
                disabled={isAtGameCap}
                title="Import games from a photo of your shelf"
              >
                <Camera className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Import from Photo</span>
                <span className="sm:hidden">Photo</span>
              </Button>
            )}
          </div>
        )}
        
        {/* Game Count and Filters - Center */}
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {showGameCapWarning && (
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                isAtGameCap ? 'text-red-500' : 'text-amber-600'
              )}
            >
              {gameCount}/450
            </span>
          )}
          
          <span className="text-sm text-muted">
            {hasActiveFilters ? (
              <span>
                Showing <strong className="text-ink">{filteredCount}</strong> of {totalCount} games
              </span>
            ) : (
              <span>
                <strong className="text-ink">{totalCount}</strong> game{totalCount !== 1 ? 's' : ''} in library
              </span>
            )}
          </span>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Library Menu - Right (hover on desktop, always visible on mobile) */}
        {libraryMenuContent && setIsLibraryMenuOpen && (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 transition-opacity",
                // Always visible on mobile, hover on desktop
                "sm:opacity-0 sm:group-hover:opacity-100",
                isLibraryMenuOpen && "sm:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                setIsLibraryMenuOpen(!isLibraryMenuOpen);
              }}
              aria-label="Library options"
              aria-expanded={isLibraryMenuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal className="w-5 h-5" />
            </Button>

            {isLibraryMenuOpen && (
              <div
                className="absolute top-full right-0 mt-2 w-48 bg-paper border border-gold-2 rounded-lg shadow-lg z-50"
                onClick={(e) => e.stopPropagation()}
                data-library-menu
              >
                {libraryMenuContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


