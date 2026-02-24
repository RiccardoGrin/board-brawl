import { useNavigate } from 'react-router-dom';
import { Star, Heart, Edit2, Trash2, ArrowRightLeft, DollarSign, EyeOff, Eye, ExternalLink } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { LibraryGameView } from '../../types/library';
import { STATUS_COLORS, STATUS_LABELS } from '../../types/library';
import { DropdownMenu, type DropdownMenuItem } from '../ui/dropdown-menu';

interface LibraryItemCardProps {
  item: LibraryGameView;
  onEdit: (item: LibraryGameView) => void;
  onDelete: (item: LibraryGameView) => void;
  onToggleFavorite: (item: LibraryGameView) => void;
  onToggleHideFromPublic?: (item: LibraryGameView) => void;
  readOnly?: boolean;
}

export function LibraryItemCard({
  item,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleHideFromPublic,
  readOnly = false,
}: LibraryItemCardProps) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (!readOnly) {
      onEdit(item);
    }
  };

  const handleGameNameClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from triggering
    navigate(`/games/${item.gameId}`);
  };

  // Define menu items
  const menuItems: DropdownMenuItem[] = [
    {
      label: 'View Details',
      icon: <ExternalLink className="w-4 h-4" aria-hidden="true" />,
      onClick: () => navigate(`/games/${item.gameId}`),
    },
    {
      label: item.favorite ? 'Unfavorite' : 'Favorite',
      icon: <Heart className={cn('w-4 h-4', item.favorite && 'fill-current')} aria-hidden="true" />,
      onClick: () => onToggleFavorite(item),
    },
    {
      label: 'Edit',
      icon: <Edit2 className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onEdit(item),
    },
    // Hide from public toggle (only shown for public libraries)
    ...(onToggleHideFromPublic
      ? [
          {
            label: item.hideFromPublic ? 'Show in Public' : 'Hide from Public',
            icon: item.hideFromPublic ? (
              <Eye className="w-4 h-4" aria-hidden="true" />
            ) : (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ),
            onClick: () => onToggleHideFromPublic(item),
          },
        ]
      : []),
    {
      label: 'Remove',
      icon: <Trash2 className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onDelete(item),
      variant: 'danger' as const,
    },
  ];

  // Format rating display
  const formatRating = (rating?: number) => {
    if (rating === undefined || rating === null) return null;
    return rating.toFixed(1);
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'card-medieval p-4 cursor-pointer group transition-all hover:shadow-md',
        'flex gap-4 items-start relative overflow-hidden',
        readOnly && 'cursor-default',
        item.hideFromPublic && 'opacity-60'
      )}
      role="article"
      aria-label={`${item.gameName} in your library`}
    >
      {/* Thumbnail */}
      <div className="shrink-0">
        {item.gameThumbnail ? (
          <img
            src={item.gameThumbnail}
            alt=""
            className="w-16 h-16 sm:w-20 sm:h-20 rounded object-cover border border-border-2"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-lg font-bold text-gold">
            {item.gameName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2 overflow-hidden pr-4">
        {/* Title row */}
        <div className="min-w-0">
          <h3
            onClick={handleGameNameClick}
            className="font-bold text-ink text-base sm:text-lg truncate hover:text-gold transition-colors cursor-pointer"
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/games/${item.gameId}`);
              }
            }}
          >
            {item.gameName}
          </h3>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          {item.gameYear && <span>{item.gameYear}</span>}
        </div>

        {/* Status and badges row */}
        <div className="flex flex-wrap items-center gap-2">
          {item.favorite && (
            <Heart className="w-4 h-4 text-red-500 fill-current" aria-label="Favorite game" />
          )}

          {/* Hidden from public indicator */}
          {item.hideFromPublic && (
            <EyeOff className="w-4 h-4 text-muted" aria-label="Hidden from public view" />
          )}

          {/* Only show status badge if not "owned" (since that's the default) */}
          {item.status !== 'owned' && (
            <span className={cn('text-xs px-2 py-0.5 rounded font-medium', STATUS_COLORS[item.status])}>
              {STATUS_LABELS[item.status]}
            </span>
          )}

          {item.myRating !== undefined && item.myRating !== null && (
            <span
              className="flex items-center gap-1 text-xs text-amber-600"
              aria-label={`Rating: ${formatRating(item.myRating)} out of 10`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span aria-hidden="true">{formatRating(item.myRating)}</span>
            </span>
          )}

          {(item.playCount ?? 0) > 0 && (
            <span className="text-xs text-muted">
              {item.playCount} play{item.playCount !== 1 ? 's' : ''}
            </span>
          )}

          {item.forTrade && (
            <span className="flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              <ArrowRightLeft className="w-3 h-3" aria-hidden="true" />
              Trade
            </span>
          )}

          {item.forSale && (
            <span className="flex items-center gap-0.5 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
              <DollarSign className="w-3 h-3" aria-hidden="true" />
              Sale
            </span>
          )}
        </div>

        {/* Notes preview */}
        {item.notes && <p className="text-xs text-muted italic line-clamp-2">{item.notes}</p>}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[10px] bg-paper-2 px-1.5 py-0.5 rounded text-muted">
                {tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[10px] text-muted">+{item.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Menu button (owner only) */}
      {!readOnly && (
        <div className="absolute top-3 right-3">
          <DropdownMenu
            ariaLabel={`Actions for ${item.gameName}`}
            items={menuItems}
            usePortal={true}
          />
        </div>
      )}
    </div>
  );
}
