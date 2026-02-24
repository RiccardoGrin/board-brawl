import { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, Star, RotateCcw, Upload, Trash2 } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import type { LibraryGameView, UserGameStatus, GameCondition } from '../../types/library';
import { CONDITION_LABELS, getGameDimensions } from '../../types/library';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { updateGameFocalPoint } from '../../services/gameSearch';

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: LibraryGameView | null;
  onSave: (gameId: string, updates: Partial<LibraryGameView>) => void;
  onDelete?: (item: LibraryGameView) => void;
}

const CONDITION_OPTIONS: (GameCondition | '')[] = ['', 'new', 'likeNew', 'good', 'fair', 'worn'];

export function EditItemModal({ isOpen, onClose, item, onSave, onDelete }: EditItemModalProps) {
  const { isAdmin } = useFeatureAccess();
  const [status, setStatus] = useState<UserGameStatus>('owned');
  const [rating, setRating] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [forTrade, setForTrade] = useState(false);
  const [forSale, setForSale] = useState(false);
  const [condition, setCondition] = useState<GameCondition | ''>('');
  const [language, setLanguage] = useState('');
  const [edition, setEdition] = useState('');
  const [boxWidthCm, setBoxWidthCm] = useState<string>('');
  const [boxHeightCm, setBoxHeightCm] = useState<string>('');
  const [boxDepthCm, setBoxDepthCm] = useState<string>('');
  const [focalPointX, setFocalPointX] = useState<number>(50);
  const [focalPointY, setFocalPointY] = useState<number>(50);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [savingToGames, setSavingToGames] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when item changes
  useEffect(() => {
    if (item) {
      setStatus(item.status);
      setRating(item.myRating !== undefined && item.myRating !== null ? item.myRating.toString() : '');
      setNotes(item.notes || '');
      setTags(item.tags?.join(', ') || '');
      setForTrade(item.forTrade);
      setForSale(item.forSale);
      setCondition(item.condition || '');
      setLanguage(item.language || '');
      setEdition(item.edition || '');
      // Convert mm to cm for display
      setBoxWidthCm(item.boxWidthMm ? (item.boxWidthMm / 10).toFixed(1) : '');
      setBoxHeightCm(item.boxHeightMm ? (item.boxHeightMm / 10).toFixed(1) : '');
      setBoxDepthCm(item.boxDepthMm ? (item.boxDepthMm / 10).toFixed(1) : '');
      // Focal point (defaults to 50%)
      setFocalPointX(item.focalPointX ?? 50);
      setFocalPointY(item.focalPointY ?? 50);
      // Reset image dimensions so they're recalculated for new image
      setImageDimensions(null);
      setError(null);
    }
  }, [item]);

  // Handle click on focal point image preview
  // Converts click position to object-position value accounting for how object-position works
  const handleFocalPointClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!item) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    // Calculate the crop box height ratio based on game dimensions
    const dims = getGameDimensions(item);
    const cropAspectRatio = dims.widthCm / dims.depthCm;
    const boxHeight = 100 / cropAspectRatio; // e.g., 20% for 5:1 ratio

    // Convert click position to object-position value
    // object-position Y% aligns the Y% point of image with Y% point of container
    // Visible top = focalPointY * (100 - boxHeight) / 100
    // So: focalPointY = (clickY - boxHeight/2) * 100 / (100 - boxHeight)
    const focalY = (clickY - boxHeight / 2) * 100 / (100 - boxHeight);

    // Clamp to 0-100 and round
    setFocalPointX(Math.round(Math.max(0, Math.min(100, clickX))));
    setFocalPointY(Math.round(Math.max(0, Math.min(100, focalY))));
  }, [item]);

  const isDefaultFocalPoint = focalPointX === 50 && focalPointY === 50;

  const handleSubmit = () => {
    if (!item) return;

    // Parse rating
    const parsedRating = rating ? parseFloat(rating) : undefined;
    if (parsedRating !== undefined && (isNaN(parsedRating) || parsedRating < 0 || parsedRating > 10)) {
      setError('Rating must be between 0 and 10.');
      return;
    }

    // Parse tags
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Parse dimensions (cm to mm, validate 0-100cm range)
    const parseDimension = (value: string): number | undefined => {
      if (!value.trim()) return undefined;
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) return undefined;
      return Math.round(parsed * 10); // Convert cm to mm
    };

    const updates: Partial<LibraryGameView> = {
      status,
      myRating: parsedRating,
      notes: notes.trim() || undefined,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      forTrade,
      forSale,
      condition: condition || undefined,
      language: language.trim() || undefined,
      edition: edition.trim() || undefined,
      boxWidthMm: parseDimension(boxWidthCm),
      boxHeightMm: parseDimension(boxHeightCm),
      boxDepthMm: parseDimension(boxDepthCm),
      // Only store focal point if not default (50, 50)
      focalPointX: focalPointX !== 50 ? focalPointX : undefined,
      focalPointY: focalPointY !== 50 ? focalPointY : undefined,
    };

    onSave(item.gameId, updates);
    onClose();
  };

  if (!item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Game"
      contentClassName="px-5 py-8"
      headerClassName="flex items-center justify-between px-5 py-6 border-b border-border-2"
    >
      <div className="space-y-5 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2 -mr-1">
        {/* Game Info (read-only) */}
        <div className="flex items-center gap-3 p-3 bg-paper-2/50 rounded">
          {item.gameThumbnail ? (
            <img
              src={item.gameThumbnail}
              alt=""
              className="w-12 h-12 rounded object-cover border border-border-2"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-gold/10 border border-gold-2/40 flex items-center justify-center text-sm font-bold text-gold">
              {item.gameName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h4 className="font-bold text-ink">{item.gameName}</h4>
            {item.gameYear && <p className="text-xs text-muted">{item.gameYear}</p>}
          </div>
        </div>

        {/* Rating */}
        <div className="space-y-2">
          <label htmlFor="edit-rating" className="block text-sm font-medium text-ink">
            Your Rating <span className="text-muted text-xs">(0-10)</span>
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="edit-rating"
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="—"
              className="w-20"
            />
            {rating && (
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-medium">{rating}</span>
              </div>
            )}
          </div>
        </div>

        {/* Trade / Sale Flags */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink" id="availability-label">
            Availability
          </label>
          <div className="flex gap-4" role="group" aria-labelledby="availability-label">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forTrade}
                onChange={(e) => setForTrade(e.target.checked)}
                className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                aria-label="Mark game as available for trade"
              />
              <span className="text-sm">For Trade</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forSale}
                onChange={(e) => setForSale(e.target.checked)}
                className="w-4 h-4 rounded border-border-2 text-gold focus:ring-gold"
                aria-label="Mark game as available for sale"
              />
              <span className="text-sm">For Sale</span>
            </label>
          </div>
        </div>

        {/* Condition */}
        <div className="space-y-2">
          <label htmlFor="edit-condition" className="block text-sm font-medium text-ink">
            Condition
          </label>
          <Select
            id="edit-condition"
            value={condition}
            onChange={(value) => setCondition(value as GameCondition | '')}
            options={[
              { value: '', label: 'Not specified' },
              ...CONDITION_OPTIONS.filter((c) => c !== '').map((c) => ({
                value: c,
                label: CONDITION_LABELS[c as GameCondition],
              })),
            ]}
            placeholder="Not specified"
          />
        </div>

        {/* Box Dimensions (for shelf display) */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">
            Box Dimensions <span className="text-muted text-xs">(cm, for shelf display)</span>
          </label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="edit-box-width" className="block text-xs text-muted mb-1">Width</label>
              <Input
                id="edit-box-width"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={boxWidthCm}
                onChange={(e) => setBoxWidthCm(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="edit-box-height" className="block text-xs text-muted mb-1">Height</label>
              <Input
                id="edit-box-height"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={boxHeightCm}
                onChange={(e) => setBoxHeightCm(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="edit-box-depth" className="block text-xs text-muted mb-1">Depth</label>
              <Input
                id="edit-box-depth"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={boxDepthCm}
                onChange={(e) => setBoxDepthCm(e.target.value)}
                placeholder="6"
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Width × Height is the box face. Depth is the spine thickness.
          </p>
        </div>

        {/* Focal Point Editor - shows crop box representing visible area on shelf */}
        {item.gameThumbnail && (() => {
          // Calculate crop box dimensions based on game's aspect ratio
          const dims = getGameDimensions(item);
          // Crop box has the same aspect ratio as the shelf spine: width:depth
          const cropAspectRatio = dims.widthCm / dims.depthCm; // e.g., 5 for 30x6cm
          const boxWidth = 100; // percentage of image width
          const boxHeight = (100 / cropAspectRatio); // percentage, e.g., 20% for 5:1 ratio

          // Calculate rendered image size based on natural dimensions
          const maxSize = 240; // 20% larger than before
          let renderWidth = maxSize;
          let renderHeight = maxSize;
          if (imageDimensions) {
            const { width, height } = imageDimensions;
            if (width > height) {
              renderWidth = maxSize;
              renderHeight = (height / width) * maxSize;
            } else {
              renderHeight = maxSize;
              renderWidth = (width / height) * maxSize;
            }
          }

          // Calculate box position based on how object-position actually works
          const boxLeft = 0; // Full width, always at left edge
          const boxTop = focalPointY * (100 - boxHeight) / 100;

          return (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink text-center">
                Visible Area <span className="text-muted text-xs">(click to position)</span>
              </label>

              {/* Centered image with crop box overlay */}
              <div className="flex justify-center">
                <div
                  className="relative rounded border border-border-2 overflow-hidden cursor-crosshair"
                  style={{
                    width: imageDimensions ? `${renderWidth}px` : 'auto',
                    height: imageDimensions ? `${renderHeight}px` : 'auto',
                    maxWidth: `${maxSize}px`,
                    maxHeight: `${maxSize}px`,
                  }}
                  onClick={handleFocalPointClick}
                >
                  {/* Darkened image behind - shows full image */}
                  <img
                    src={item.gameThumbnail}
                    alt={item.gameName}
                    className="w-full h-full brightness-50"
                    style={{ display: 'block' }}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    }}
                  />

                  {/* Crop box showing the visible area */}
                  {imageDimensions && (
                    <div
                      className="absolute pointer-events-none overflow-hidden rounded-sm border-2 border-white shadow-lg"
                      style={{
                        width: `${boxWidth}%`,
                        height: `${boxHeight}%`,
                        left: `${boxLeft}%`,
                        top: `${boxTop}%`,
                      }}
                    >
                      {/* Bright cropped portion of image */}
                      <img
                        src={item.gameThumbnail}
                        alt=""
                        className="absolute"
                        style={{
                          width: `${renderWidth}px`,
                          height: `${renderHeight}px`,
                          left: `${-boxLeft / 100 * renderWidth}px`,
                          top: `${-boxTop / 100 * renderHeight}px`,
                        }}
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-2">
                {!isDefaultFocalPoint && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFocalPointX(50);
                      setFocalPointY(50);
                    }}
                    className="text-xs"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                )}
                {/* Admin-only button to save focal point to shared games collection */}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={savingToGames}
                    onClick={async () => {
                      if (!item) return;
                      setSavingToGames(true);
                      try {
                        await updateGameFocalPoint(item.gameId, focalPointX, focalPointY);
                      } catch (err) {
                        console.error('Failed to save focal point to games collection:', err);
                      } finally {
                        setSavingToGames(false);
                      }
                    }}
                    className="text-xs text-amber-600 hover:text-amber-700"
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    {savingToGames ? 'Saving...' : 'Save to Games'}
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Language */}
        <div className="space-y-2">
          <label htmlFor="edit-language" className="block text-sm font-medium text-ink">
            Language
          </label>
          <Input
            id="edit-language"
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="e.g., English"
            maxLength={50}
            className="max-w-[200px]"
          />
        </div>

        {/* Edition */}
        <div className="space-y-2">
          <label htmlFor="edit-edition" className="block text-sm font-medium text-ink">
            Edition
          </label>
          <Input
            id="edit-edition"
            type="text"
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
            placeholder="e.g., Deluxe Edition"
            maxLength={100}
            className="max-w-[250px]"
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label htmlFor="edit-tags" className="block text-sm font-medium text-ink">
            Tags <span className="text-muted text-xs">(comma separated)</span>
          </label>
          <Input
            id="edit-tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g., 2-player, heavy, cooperative"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label htmlFor="edit-notes" className="block text-sm font-medium text-ink">
            Notes
          </label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Personal notes about this game..."
            maxLength={500}
            rows={3}
            className="resize-none"
          />
          <div className="text-xs text-muted text-right">{notes.length}/500</div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="divider-line mt-4" />
      <div className="flex justify-between gap-3 pt-4">
        {onDelete ? (
          <Button
            variant="ghost"
            onClick={() => {
              onDelete(item);
              onClose();
            }}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            <Save className="w-4 h-4 mr-1" />
            Update
          </Button>
        </div>
      </div>
    </Modal>
  );
}
