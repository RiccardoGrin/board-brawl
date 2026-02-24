import { useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, ArrowUpDown, Trophy, Calendar } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/button';
import type { PlaysFilters, PlaysSort, PlaysSortField } from '../../types/plays';

interface PlaysFiltersBarProps {
  filters: PlaysFilters;
  sort: PlaysSort;
  onFiltersChange: (filters: PlaysFilters) => void;
  onSortChange: (sort: PlaysSort) => void;
  totalCount: number;
  filteredCount: number;
  onLogPlay?: () => void;
}

const SORT_OPTIONS: { field: PlaysSortField; label: string }[] = [
  { field: 'playedAt', label: 'Date Played' },
  { field: 'gameName', label: 'Game Name' },
];

export function PlaysFiltersBar({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  totalCount,
  filteredCount,
  onLogPlay,
}: PlaysFiltersBarProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const hasActiveFilters =
    filters.tournamentOnly ||
    filters.casualOnly ||
    filters.winsOnly ||
    filters.search;

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value || undefined });
  };

  const handleToggleFilter = (key: 'tournamentOnly' | 'casualOnly' | 'winsOnly') => {
    // For mutually exclusive filters (tournament vs casual), clear the other when setting
    if (key === 'tournamentOnly' && !filters.tournamentOnly) {
      onFiltersChange({ ...filters, tournamentOnly: true, casualOnly: undefined });
    } else if (key === 'casualOnly' && !filters.casualOnly) {
      onFiltersChange({ ...filters, casualOnly: true, tournamentOnly: undefined });
    } else {
      onFiltersChange({ ...filters, [key]: filters[key] ? undefined : true });
    }
  };

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const handleSortFieldChange = (field: PlaysSortField) => {
    if (sort.field === field) {
      // Toggle direction
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      // New field, default to descending for date, ascending for name
      const defaultDirection = field === 'gameName' ? 'asc' : 'desc';
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
            placeholder="Search by game name..."
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
            {(filters.tournamentOnly || filters.casualOnly || filters.winsOnly) && (
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
                    checked={!!filters.tournamentOnly}
                    onChange={() => handleToggleFilter('tournamentOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only tournament plays"
                  />
                  <Trophy className="w-4 h-4 text-gold" aria-hidden="true" />
                  <span className="text-sm">Tournament</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.casualOnly}
                    onChange={() => handleToggleFilter('casualOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only casual plays"
                  />
                  <Calendar className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span className="text-sm">Casual</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.winsOnly}
                    onChange={() => handleToggleFilter('winsOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games you won"
                  />
                  <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  <span className="text-sm">Wins Only</span>
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
            placeholder="Search by game name..."
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
            {(filters.tournamentOnly || filters.casualOnly || filters.winsOnly) && (
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
                    checked={!!filters.tournamentOnly}
                    onChange={() => handleToggleFilter('tournamentOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only tournament plays"
                  />
                  <Trophy className="w-4 h-4 text-gold" aria-hidden="true" />
                  <span className="text-sm">Tournament</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.casualOnly}
                    onChange={() => handleToggleFilter('casualOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only casual plays"
                  />
                  <Calendar className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span className="text-sm">Casual</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gold-2/10 rounded cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={!!filters.winsOnly}
                    onChange={() => handleToggleFilter('winsOnly')}
                    className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                    aria-label="Show only games you won"
                  />
                  <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  <span className="text-sm">Wins Only</span>
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
      </div>

      {/* Results Count with Actions */}
      <div className="flex items-center gap-3 group">
        {/* Log Play Button - Left */}
        {onLogPlay && (
          <Button variant="primary" onClick={onLogPlay}>
            Log Play
          </Button>
        )}

        {/* Play Count and Filters - Center */}
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <span className="text-sm text-muted">
            {hasActiveFilters ? (
              <span>
                Showing <strong className="text-ink">{filteredCount}</strong> of {totalCount} plays
              </span>
            ) : (
              <span>
                <strong className="text-ink">{totalCount}</strong> play{totalCount !== 1 ? 's' : ''} logged
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
      </div>
    </div>
  );
}
