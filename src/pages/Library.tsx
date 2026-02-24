import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus,
  Minus,
  BookOpen,
  ArrowLeft,
  Loader2,
  X,
  Save,
  ChevronDown,
  Lock,
  Globe,
  Edit2,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { useNotificationStore } from '../store/notificationStore';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import { Input, Textarea } from '../components/ui/input';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import {
  LibraryItemCard,
  AddGameModal,
  EditItemModal,
  LibraryFiltersBar,
  ShelfView,
  PhotoImportModal,
} from '../components/library';
import type { ImportedGame } from '../services/photoImport';
import { convertBoxDimensionsToMm } from '../services/gameSearch';
import type { LibraryGameView, LibraryVisibility, LibraryViewMode } from '../types/library';
import { SHELF_MIN_ROWS, SHELF_MAX_ROWS, DEFAULT_SHELF_THEME } from '../types/library';
import { ColorSelectorRow } from '../components/ui/color-selector-row';
import { cn } from '../utils/cn';

/** Maximum games per library (for batch delete safety) */
const GAME_CAP = 450;
/** Show counter when this threshold is reached */
const GAME_CAP_WARNING_THRESHOLD = 400;

export default function LibraryPage() {
  const navigate = useNavigate();
  const { libraryId: libraryIdParam } = useParams<{ libraryId?: string }>();
  const user = useAuthStore((state) => state.user);
  const userProfile = useAuthStore((state) => state.userProfile);
  const initialized = useAuthStore((state) => state.initialized);
  const lastSuccessAt = useSyncStore((state) => state.lastSuccessAt);
  const showNotification = useNotificationStore((state) => state.show);
  const { canUseAiPhotoImport } = useFeatureAccess();

  // Library store
  const libraries = useLibraryStore((state) => state.libraries);
  const memberships = useLibraryStore((state) => state.memberships);
  const userGames = useLibraryStore((state) => state.userGames);
  const filters = useLibraryStore((state) => state.filters);
  const sort = useLibraryStore((state) => state.sort);
  const setFilters = useLibraryStore((state) => state.setFilters);
  const setSort = useLibraryStore((state) => state.setSort);
  const addGameToLibrary = useLibraryStore((state) => state.addGameToLibrary);
  const updateUserGame = useLibraryStore((state) => state.updateUserGame);
  const removeGameFromLibrary = useLibraryStore((state) => state.removeGameFromLibrary);
  const updateLibrary = useLibraryStore((state) => state.updateLibrary);
  const deleteLibrary = useLibraryStore((state) => state.deleteLibrary);
  const createLibrary = useLibraryStore((state) => state.createLibrary);
  const getFilteredItems = useLibraryStore((state) => state.getFilteredItems);
  const getLibraryItems = useLibraryStore((state) => state.getLibraryItems);
  const getLibraryGameCount = useLibraryStore((state) => state.getLibraryGameCount);
  const updateMembership = useLibraryStore((state) => state.updateMembership);
  const setLastVisitedLibraryId = useLibraryStore((state) => state.setLastVisitedLibraryId);
  const setLibraryViewMode = useLibraryStore((state) => state.setLibraryViewMode);
  const shelves = useLibraryStore((state) => state.shelves);
  const initializeShelf = useLibraryStore((state) => state.initializeShelf);
  const addShelfRow = useLibraryStore((state) => state.addShelfRow);
  const removeShelfRow = useLibraryStore((state) => state.removeShelfRow);
  const batchAddGamesToShelf = useLibraryStore((state) => state.batchAddGamesToShelf);

  // Local state
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isPhotoImportOpen, setIsPhotoImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LibraryGameView | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<LibraryGameView | null>(null);
  const [isLibraryDropdownOpen, setIsLibraryDropdownOpen] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isDeleteLibraryOpen, setIsDeleteLibraryOpen] = useState(false);
  const [isCreateLibraryModalOpen, setIsCreateLibraryModalOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryDescription, setNewLibraryDescription] = useState('');
  const [newLibraryVisibility, setNewLibraryVisibility] = useState<LibraryVisibility>('public');

  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameEdit, setNameEdit] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionEdit, setDescriptionEdit] = useState('');

  const NAME_MAX = 50;
  const DESCRIPTION_MAX = 200;
  const COUNTER_THRESHOLD = {
    name: Math.ceil(NAME_MAX * 0.8),
    description: Math.ceil(DESCRIPTION_MAX * 0.8),
  };

  // Get active library
  const activeLibraryId = libraryIdParam || null;
  const activeLibrary = activeLibraryId ? libraries[activeLibraryId] : null;

  // Sort libraries for dropdown
  const sortedLibraries = useMemo(() => {
    return Object.values(libraries).sort((a, b) => {
      const aSort = a.sortOrder ?? 100;
      const bSort = b.sortOrder ?? 100;
      return aSort - bSort;
    });
  }, [libraries]);

  // Mark initial load complete
  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      setHasCompletedInitialLoad(true);
    } else if (lastSuccessAt !== null) {
      setHasCompletedInitialLoad(true);
    }
  }, [initialized, user, lastSuccessAt]);

  // Handle library not found
  useEffect(() => {
    if (!initialized || !hasCompletedInitialLoad) return;
    if (libraryIdParam && !libraries[libraryIdParam]) {
      // Library not found - redirect to library list
      navigate('/library', { replace: true });
    }
  }, [initialized, hasCompletedInitialLoad, libraryIdParam, libraries, navigate]);

  // Track last visited library
  useEffect(() => {
    if (activeLibraryId && activeLibrary) {
      setLastVisitedLibraryId(activeLibraryId);
    }
  }, [activeLibraryId, activeLibrary, setLastVisitedLibraryId]);

  // Initialize shelf when viewing in shelf mode (handles page reload case)
  useEffect(() => {
    if (!activeLibraryId || !activeLibrary) return;
    if (!hasCompletedInitialLoad) return;

    // If library is in shelf mode but no shelf exists, initialize one
    if (activeLibrary.viewMode === 'shelf' && !shelves[activeLibraryId]) {
      initializeShelf(activeLibraryId);
    }
  }, [activeLibraryId, activeLibrary, hasCompletedInitialLoad, shelves, initializeShelf]);

  // Get items for active library
  const allItems = useMemo(() => {
    if (!activeLibraryId) return [];
    return getLibraryItems(activeLibraryId);
  }, [activeLibraryId, getLibraryItems, memberships, userGames]);

  const filteredItems = useMemo(() => {
    if (!activeLibraryId) return [];
    return getFilteredItems(activeLibraryId);
  }, [activeLibraryId, getFilteredItems, filters, sort, memberships, userGames]);

  // Game count for cap warning
  const gameCount = activeLibraryId ? getLibraryGameCount(activeLibraryId) : 0;
  const showGameCapWarning = gameCount >= GAME_CAP_WARNING_THRESHOLD;
  const isAtGameCap = gameCount >= GAME_CAP;

  // Get set of existing game IDs for duplicate detection
  const existingGameIds = useMemo(() => {
    return new Set(allItems.map((item) => item.gameId));
  }, [allItems]);

  // Handlers
  const handleAddGame = (game: {
    gameId: string;
    gameName: string;
    gameThumbnail?: string;
    gameYear?: number;
    status: LibraryGameView['status'];
    myRating?: number;
    notes?: string;
    boxWidthMm?: number;
    boxHeightMm?: number;
    boxDepthMm?: number;
    focalPointX?: number;
    focalPointY?: number;
  }) => {
    if (!activeLibraryId) return;
    if (isAtGameCap) {
      showNotification('error', `Library limit reached (${GAME_CAP} games)`);
      return;
    }

    addGameToLibrary(activeLibraryId, game, {
      status: game.status,
      myRating: game.myRating,
      notes: game.notes,
      boxWidthMm: game.boxWidthMm,
      boxHeightMm: game.boxHeightMm,
      boxDepthMm: game.boxDepthMm,
      focalPointX: game.focalPointX,
      focalPointY: game.focalPointY,
    });
    setIsAddGameOpen(false);
  };

  const handleEditItem = (item: LibraryGameView) => {
    setEditingItem(item);
  };

  const handleSaveItem = (gameId: string, updates: Partial<LibraryGameView>) => {
    // Update UserGame (rating, notes, etc.)
    updateUserGame(gameId, updates);
    setEditingItem(null);
  };

  const handleDeleteItem = (item: LibraryGameView) => {
    setDeleteConfirmItem(item);
  };

  const confirmDelete = () => {
    if (deleteConfirmItem && activeLibraryId) {
      removeGameFromLibrary(activeLibraryId, deleteConfirmItem.gameId);
      setDeleteConfirmItem(null);
    }
  };

  const handleToggleFavorite = (item: LibraryGameView) => {
    updateUserGame(item.gameId, { favorite: !item.favorite });
  };

  const handleToggleHideFromPublic = (item: LibraryGameView) => {
    if (activeLibraryId) {
      updateMembership(activeLibraryId, item.gameId, {
        hideFromPublic: !item.hideFromPublic,
      });
    }
  };

  const handleSaveName = () => {
    if (activeLibraryId && nameEdit.trim() && activeLibrary && !activeLibrary.systemKey) {
      updateLibrary(activeLibraryId, { name: nameEdit.trim() });
      setIsEditingName(false);
    }
  };

  const handleStartEditName = () => {
    if (activeLibrary?.systemKey) return; // Can't rename system libraries
    setNameEdit(activeLibrary?.name || '');
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setNameEdit(activeLibrary?.name || '');
  };

  const handleSaveDescription = () => {
    if (activeLibraryId) {
      updateLibrary(activeLibraryId, {
        description: descriptionEdit.trim() || undefined,
      });
      setIsEditingDescription(false);
    }
  };

  const handleToggleVisibility = () => {
    if (activeLibraryId && activeLibrary) {
      updateLibrary(activeLibraryId, {
        visibility: activeLibrary.visibility === 'public' ? 'private' : 'public',
      });
    }
  };

  const handleCopyShareLink = async () => {
    if (!userProfile?.userCode || !activeLibraryId) return;
    if (activeLibrary?.visibility !== 'public') return;

    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
    const shareUrl = `${siteUrl}/u/${userProfile.userCode}/library/${activeLibraryId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotification('success', 'Share link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy share link:', err);
      showNotification('error', 'Failed to copy link');
    }
  };

  const handleDeleteLibrary = () => {
    if (activeLibraryId && activeLibrary && !activeLibrary.systemKey) {
      deleteLibrary(activeLibraryId);
      setIsDeleteLibraryOpen(false);
      navigate('/library');
    }
  };

  const handleAddGameClick = () => {
    if (isAtGameCap) {
      showNotification('error', `Library limit reached (${GAME_CAP} games)`);
      return;
    }
    setIsAddGameOpen(true);
  };

  const handlePhotoImportClick = () => {
    if (isAtGameCap) {
      showNotification('error', `Library limit reached (${GAME_CAP} games)`);
      return;
    }
    setIsPhotoImportOpen(true);
  };

  const handlePhotoImport = (games: ImportedGame[], targetLibraryId: string) => {
    if (!user) return;

    const addedGameIds: string[] = [];

    for (const importedGame of games) {
      // Convert box dimensions from inches to mm
      const boxDimensions = convertBoxDimensionsToMm({
        boxWidthInches: importedGame.game.boxWidthInches,
        boxLengthInches: importedGame.game.boxLengthInches,
        boxDepthInches: importedGame.game.boxDepthInches,
      });

      const success = addGameToLibrary(targetLibraryId, {
        gameId: importedGame.game.gameId,
        gameName: importedGame.game.primaryName,
        gameThumbnail: importedGame.game.thumbnail,
        gameYear: importedGame.game.year,
      }, {
        boxWidthMm: boxDimensions.boxWidthMm,
        boxHeightMm: boxDimensions.boxHeightMm,
        boxDepthMm: boxDimensions.boxDepthMm,
        focalPointX: importedGame.game.focalPointX,
        focalPointY: importedGame.game.focalPointY,
      });

      if (success) {
        addedGameIds.push(importedGame.game.gameId);
      }
    }

    // Auto-switch to shelf view and place only newly added games on shelf
    if (addedGameIds.length > 0) {
      // Always switch to shelf view and add games
      setLibraryViewMode(targetLibraryId, 'shelf');
      const { placed, overflow } = batchAddGamesToShelf(targetLibraryId, addedGameIds);

      // Show appropriate notification
      if (overflow > 0) {
        showNotification(
          'info',
          `Placed ${placed} games on shelf. ${overflow} games in unplaced area (shelf full).`
        );
      } else {
        showNotification('success', `Added ${placed} games to your shelf!`);
      }
    }
  };

  const handleCreateLibrary = () => {
    if (!newLibraryName.trim()) return;

    const libraryId = createLibrary(newLibraryName.trim(), newLibraryVisibility);
    if (libraryId) {
      updateLibrary(libraryId, {
        description: newLibraryDescription.trim() || undefined,
      });

      // Reset form
      setNewLibraryName('');
      setNewLibraryDescription('');
      setNewLibraryVisibility('public');
      setIsCreateLibraryModalOpen(false);

      // Navigate to the new library
      navigate(`/library/${libraryId}`);
    }
  };

  // Loading state
  const isLoading = !hasCompletedInitialLoad;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Only close if dropdowns are actually open
      if (!isLibraryDropdownOpen && !isLibraryMenuOpen) return;
      
      // Don't close if clicking inside the dropdown menus or auth menu
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-library-dropdown]') ||
        target.closest('[data-library-menu]') ||
        target.closest('[data-auth-menu]')
      ) {
        return;
      }
      
      setIsLibraryDropdownOpen(false);
      setIsLibraryMenuOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isLibraryDropdownOpen, isLibraryMenuOpen]);

  return (
    <div className="min-h-screen page-frame">
      <SEO
        path={`/library/${activeLibraryId || ''}`}
        title={`${activeLibrary?.name || 'My Library'} | BoardBrawl`}
        description="Manage your board game collection with BoardBrawl. Track games, ratings, and plays."
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
                {/* Library Name with Dropdown */}
                {isEditingName ? (
                  <div className="flex items-center gap-2 max-w-2xl -ml-3 -mt-1.5">
                    <div className="flex-1 relative">
                      <Input
                        autoFocus
                        value={nameEdit}
                        onChange={(e) => setNameEdit(e.target.value.slice(0, NAME_MAX))}
                        className="text-2xl font-bold h-11 border-gold-2/30 focus:border-gold bg-paper/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') handleCancelEditName();
                        }}
                      />
                      {nameEdit.length >= COUNTER_THRESHOLD.name && (
                        <span className="absolute right-2 bottom-1 text-[10px] text-muted tabular">
                          {nameEdit.length}/{NAME_MAX}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted hover:text-ink"
                        onClick={handleCancelEditName}
                      >
                        <X className="w-5 h-5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted hover:text-gold"
                        onClick={handleSaveName}
                      >
                        <Save className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      className="flex items-center gap-2 py-1 text-4xl font-bold text-ink engraved tracking-tight leading-tight transition-colors hover:text-gold group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsLibraryDropdownOpen(!isLibraryDropdownOpen);
                      }}
                      aria-expanded={isLibraryDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span className="truncate">{activeLibrary?.name || 'My Library'}</span>
                      <ChevronDown
                        className={cn(
                          'w-5 h-5 text-muted group-hover:text-gold transition-transform',
                          isLibraryDropdownOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {/* Library Dropdown */}
                    {isLibraryDropdownOpen && (
                      <div
                        className="absolute top-full left-0 mt-2 w-64 bg-paper border border-gold-2 rounded-lg shadow-lg z-50"
                        onClick={(e) => e.stopPropagation()}
                        data-library-dropdown
                      >
                        <div className="py-2">
                          {sortedLibraries.map((lib) => (
                            <button
                              key={lib.id}
                              className={cn(
                                'w-full px-4 py-2 text-left hover:bg-gold/10 transition-colors flex items-center gap-2',
                                lib.id === activeLibraryId && 'bg-gold/10 text-gold font-medium'
                              )}
                              onClick={() => {
                                navigate(`/library/${lib.id}`);
                                setIsLibraryDropdownOpen(false);
                              }}
                            >
                              <span className="flex-1 truncate">{lib.name}</span>
                              {lib.visibility === 'private' ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 text-muted" />
                                  <span className="text-xs text-muted">Private</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="w-3.5 h-3.5 text-muted" />
                                  <span className="text-xs text-muted">Public</span>
                                </>
                              )}
                            </button>
                          ))}
                          <div className="border-t border-gold-2 my-2" />
                          <button
                            className="w-full px-4 py-2 text-left hover:bg-gold/10 transition-colors flex items-center gap-2 text-gold"
                            onClick={() => {
                              setIsLibraryDropdownOpen(false);
                              setIsCreateLibraryModalOpen(true);
                            }}
                          >
                            <Plus className="w-4 h-4" />
                            New Library
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div className="flex-1 min-w-0 mt-0.5">
                  {isEditingDescription ? (
                    <div className="flex items-start gap-2 -ml-1">
                      <div className="flex-1 relative">
                        <Textarea
                          autoFocus
                          value={descriptionEdit}
                          onChange={(e) =>
                            setDescriptionEdit(e.target.value.slice(0, DESCRIPTION_MAX))
                          }
                          className="text-base italic min-h-[70px] border-gold-2/30 focus:border-gold py-2 bg-paper/50"
                          placeholder="Add description..."
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsEditingDescription(false);
                              setDescriptionEdit(activeLibrary?.description || '');
                            }
                          }}
                        />
                        {descriptionEdit.length >= COUNTER_THRESHOLD.description && (
                          <span className="absolute right-2 bottom-1 text-[10px] text-muted tabular">
                            {descriptionEdit.length}/{DESCRIPTION_MAX}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-muted hover:text-ink"
                          onClick={() => {
                            setIsEditingDescription(false);
                            setDescriptionEdit(activeLibrary?.description || '');
                          }}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-muted hover:text-gold"
                          onClick={handleSaveDescription}
                        >
                          <Save className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-base text-muted engraved italic py-1 cursor-pointer hover:text-gold transition-colors line-clamp-2"
                      onClick={() => {
                        setDescriptionEdit(activeLibrary?.description || '');
                        setIsEditingDescription(true);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDescriptionEdit(activeLibrary?.description || '');
                          setIsEditingDescription(true);
                        }
                      }}
                      aria-label={
                        activeLibrary?.description
                          ? `Edit description: ${activeLibrary.description}`
                          : 'Add library description'
                      }
                    >
                      {activeLibrary?.description || 'Click to add description...'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Actions Row */}
        {!isLoading && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-4">
            <LibraryFiltersBar
              filters={filters}
              sort={sort}
              onFiltersChange={setFilters}
              onSortChange={setSort}
              totalCount={allItems.length}
              filteredCount={filteredItems.length}
              onAddGame={handleAddGameClick}
              onImportFromPhoto={canUseAiPhotoImport ? handlePhotoImportClick : undefined}
              gameCount={gameCount}
              isAtGameCap={isAtGameCap}
              showGameCapWarning={showGameCapWarning}
              viewMode={activeLibrary?.viewMode ?? 'list'}
              onViewModeChange={(viewMode: LibraryViewMode) => {
                if (activeLibraryId) {
                  setLibraryViewMode(activeLibraryId, viewMode);
                }
              }}
              libraryMenuContent={
                <div className="py-2">
                  {/* Visibility Toggle */}
                  <button
                    className="w-full px-4 py-2 text-left hover:bg-gold/10 transition-colors flex items-center gap-2"
                    onClick={() => {
                      handleToggleVisibility();
                      setIsLibraryMenuOpen(false);
                    }}
                  >
                    {activeLibrary?.visibility === 'private' ? (
                      <>
                        <Globe className="w-4 h-4" />
                        Set Public
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        Set Private
                      </>
                    )}
                  </button>

                  {/* Edit Name (non-system only) */}
                  {!activeLibrary?.systemKey && (
                    <button
                      className="w-full px-4 py-2 text-left hover:bg-gold/10 transition-colors flex items-center gap-2"
                      onClick={() => {
                        handleStartEditName();
                        setIsLibraryMenuOpen(false);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename Library
                    </button>
                  )}

                  {/* Share Link (public only) */}
                  {activeLibrary?.visibility === 'public' && userProfile?.userCode && (
                    <button
                      className="w-full px-4 py-2 text-left hover:bg-gold/10 transition-colors flex items-center gap-2"
                      onClick={() => {
                        handleCopyShareLink();
                        setIsLibraryMenuOpen(false);
                      }}
                    >
                      <LinkIcon className="w-4 h-4" />
                      Copy Share Link
                    </button>
                  )}

                  {/* Shelf Row Management (only in shelf view) */}
                  {activeLibrary?.viewMode === 'shelf' && activeLibraryId && (() => {
                    const shelf = shelves[activeLibraryId];
                    return shelf ? (
                      <>
                        <div className="border-t border-gold-2 my-2" />
                        <button
                          className={cn(
                            "w-full px-4 py-2 text-left transition-colors flex items-center gap-2",
                            shelf.rowCount >= SHELF_MAX_ROWS
                              ? "text-muted cursor-not-allowed"
                              : "hover:bg-gold/10"
                          )}
                          onClick={() => {
                            if (shelf.rowCount < SHELF_MAX_ROWS) {
                              addShelfRow(activeLibraryId);
                              setIsLibraryMenuOpen(false);
                            }
                          }}
                          disabled={shelf.rowCount >= SHELF_MAX_ROWS}
                        >
                          <Plus className="w-4 h-4" />
                          Add Row
                        </button>
                        <button
                          className={cn(
                            "w-full px-4 py-2 text-left transition-colors flex items-center gap-2",
                            shelf.rowCount <= SHELF_MIN_ROWS
                              ? "text-muted cursor-not-allowed"
                              : "hover:bg-gold/10"
                          )}
                          onClick={() => {
                            if (shelf.rowCount > SHELF_MIN_ROWS) {
                              removeShelfRow(activeLibraryId);
                              setIsLibraryMenuOpen(false);
                            }
                          }}
                          disabled={shelf.rowCount <= SHELF_MIN_ROWS}
                        >
                          <Minus className="w-4 h-4" />
                          Remove Row
                        </button>
                      </>
                    ) : null;
                  })()}

                  {/* Shelf Colors */}
                  {activeLibrary?.viewMode === 'shelf' && activeLibraryId && (
                    <>
                      <div className="border-t border-gold-2 my-2" />
                      <div className="px-4 py-2 space-y-2">
                        <div className="text-xs font-bold text-muted engraved uppercase tracking-wider">
                          Shelf Colors
                        </div>
                        <ColorSelectorRow
                          label="Frame Color"
                          color={activeLibrary?.theme?.frameColor ?? DEFAULT_SHELF_THEME.frameColor}
                          onChange={(color) => updateLibrary(activeLibraryId, {
                            theme: { ...activeLibrary?.theme, frameColor: color }
                          })}
                        />
                        <ColorSelectorRow
                          label="Background Color"
                          color={activeLibrary?.theme?.backingColor ?? DEFAULT_SHELF_THEME.backingColor}
                          onChange={(color) => updateLibrary(activeLibraryId, {
                            theme: { ...activeLibrary?.theme, backingColor: color }
                          })}
                        />
                        <button
                          className="text-sm text-muted hover:text-ink transition-colors"
                          onClick={() => {
                            updateLibrary(activeLibraryId, { theme: undefined });
                            setIsLibraryMenuOpen(false);
                          }}
                        >
                          Reset to Defaults
                        </button>
                      </div>
                    </>
                  )}

                  {/* Delete (non-system only) */}
                  {!activeLibrary?.systemKey && (
                    <>
                      <div className="border-t border-gold-2 my-2" />
                      <button
                        className="w-full px-4 py-2 text-left hover:bg-red-50 transition-colors flex items-center gap-2 text-red-600"
                        onClick={() => {
                          setIsDeleteLibraryOpen(true);
                          setIsLibraryMenuOpen(false);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Library
                      </button>
                    </>
                  )}
                </div>
              }
              isLibraryMenuOpen={isLibraryMenuOpen}
              setIsLibraryMenuOpen={setIsLibraryMenuOpen}
            />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {isLoading ? (
          <div className="card-medieval p-12 text-center">
            <Loader2 className="w-8 h-8 text-gold mx-auto mb-4 animate-spin" />
            <p className="text-muted">Loading your library...</p>
          </div>
        ) : activeLibrary?.viewMode === 'shelf' && activeLibraryId ? (
          // Shelf View (Phase 2)
          (() => {
            const shelf = shelves[activeLibraryId];
            if (!shelf) {
              // Shelf will be initialized by useEffect - show loader while waiting
              return (
                <div className="card-medieval p-12 text-center">
                  <Loader2 className="w-8 h-8 text-gold mx-auto mb-4 animate-spin" />
                  <p className="text-muted">Setting up your shelf...</p>
                </div>
              );
            }
            return (
              <ShelfView
                libraryId={activeLibraryId}
                shelf={shelf}
                items={allItems}
                isReadOnly={false}
                onEditItem={handleEditItem}
                onDeleteItem={handleDeleteItem}
                onToggleFavorite={handleToggleFavorite}
              />
            );
          })()
        ) : (
          // List View (Default)
          <div className="space-y-6">
            {/* Game List */}
            {filteredItems.length === 0 ? (
              <div className="card-medieval p-12 text-center">
                <div className="mx-auto w-16 h-16 border border-dashed border-gold-2 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="w-7 h-7 text-gold-2" />
                </div>
                {allItems.length === 0 ? (
                  <>
                    <h3 className="text-xl font-bold text-ink engraved mb-2">
                      Your library is empty
                    </h3>
                    <p className="text-muted text-base mb-6">
                      Start building your collection by adding your first game.
                    </p>
                    <Button variant="primary" onClick={handleAddGameClick}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Your First Game
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-ink engraved mb-2">
                      No games match your filters
                    </h3>
                    <p className="text-muted text-base mb-6">
                      Try adjusting your filters to see more games.
                    </p>
                    <Button variant="secondary" onClick={() => setFilters({})}>
                      Clear Filters
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredItems.map((item) => (
                  <LibraryItemCard
                    key={item.gameId}
                    item={item}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                    onToggleFavorite={handleToggleFavorite}
                    onToggleHideFromPublic={
                      activeLibrary?.visibility === 'public' ? handleToggleHideFromPublic : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Game Modal */}
      <AddGameModal
        isOpen={isAddGameOpen}
        onClose={() => setIsAddGameOpen(false)}
        onAdd={handleAddGame}
        existingGameIds={existingGameIds}
      />

      {/* Photo Import Modal */}
      <PhotoImportModal
        isOpen={isPhotoImportOpen}
        onClose={() => setIsPhotoImportOpen(false)}
        onImport={handlePhotoImport}
        libraries={sortedLibraries}
        defaultLibraryId={activeLibraryId || ''}
        existingGameIds={existingGameIds}
      />

      {/* Edit Item Modal */}
      <EditItemModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      {/* Delete Game Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmItem}
        onClose={() => setDeleteConfirmItem(null)}
        title="Remove from Library?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved">
            Are you sure you want to remove{' '}
            <strong className="text-ink">{deleteConfirmItem?.gameName}</strong> from this
            library? The game's metadata (rating, notes) will be preserved if it's in other
            libraries.
          </p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={() => setDeleteConfirmItem(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Library Modal */}
      <Modal
        isOpen={isCreateLibraryModalOpen}
        onClose={() => {
          setIsCreateLibraryModalOpen(false);
          setNewLibraryName('');
          setNewLibraryDescription('');
          setNewLibraryVisibility('public');
        }}
        title="Create New Library"
      >
        <div className="space-y-6">
          <div>
            <label htmlFor="library-name" className="block text-sm font-medium text-ink mb-2">
              Library Name
              <span className="text-red-500 ml-1">*</span>
            </label>
            <Input
              id="library-name"
              autoFocus
              value={newLibraryName}
              onChange={(e) => setNewLibraryName(e.target.value.slice(0, NAME_MAX))}
              placeholder="e.g., Home Collection, Party Games"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLibraryName.trim()) {
                  handleCreateLibrary();
                }
              }}
            />
            {newLibraryName.length >= Math.ceil(NAME_MAX * 0.8) && (
              <p className="text-xs text-muted mt-1">
                {newLibraryName.length}/{NAME_MAX} characters
              </p>
            )}
          </div>

          <div>
            <label htmlFor="library-description" className="block text-sm font-medium text-ink mb-2">
              Description (Optional)
            </label>
            <Textarea
              id="library-description"
              value={newLibraryDescription}
              onChange={(e) => setNewLibraryDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Describe this collection..."
              className="w-full"
              rows={3}
            />
            {newLibraryDescription.length >= Math.ceil(DESCRIPTION_MAX * 0.8) && (
              <p className="text-xs text-muted mt-1">
                {newLibraryDescription.length}/{DESCRIPTION_MAX} characters
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Visibility</label>
            <div className="flex gap-3">
              <button
                className={cn(
                  'flex-1 px-4 py-3 rounded-lg border-2 transition-all',
                  newLibraryVisibility === 'public'
                    ? 'border-gold bg-gold/10 text-ink'
                    : 'border-gold-2/30 bg-white/50 text-muted hover:border-gold-2'
                )}
                onClick={() => setNewLibraryVisibility('public')}
              >
                <Globe className="w-5 h-5 mx-auto mb-1" />
                <div className="text-sm font-medium">Public</div>
                <div className="text-xs opacity-70">Shareable link</div>
              </button>
              <button
                className={cn(
                  'flex-1 px-4 py-3 rounded-lg border-2 transition-all',
                  newLibraryVisibility === 'private'
                    ? 'border-gold bg-gold/10 text-ink'
                    : 'border-gold-2/30 bg-white/50 text-muted hover:border-gold-2'
                )}
                onClick={() => setNewLibraryVisibility('private')}
              >
                <Lock className="w-5 h-5 mx-auto mb-1" />
                <div className="text-sm font-medium">Private</div>
                <div className="text-xs opacity-70">Only you can see</div>
              </button>
            </div>
          </div>

          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreateLibraryModalOpen(false);
                setNewLibraryName('');
                setNewLibraryDescription('');
                setNewLibraryVisibility('public');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateLibrary}
              disabled={!newLibraryName.trim()}
            >
              Create Library
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Library Confirmation Modal */}
      <Modal
        isOpen={isDeleteLibraryOpen}
        onClose={() => setIsDeleteLibraryOpen(false)}
        title="Delete Library?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted engraved">
            Are you sure you want to delete{' '}
            <strong className="text-ink">{activeLibrary?.name}</strong>? This will remove
            the library and its {gameCount} games. Games that exist in other libraries will
            keep their metadata.
          </p>
          <div className="divider-line" />
          <div className="flex justify-end gap-4">
            <Button variant="ghost" onClick={() => setIsDeleteLibraryOpen(false)}>
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
