/**
 * CustomDragOverlay Component
 *
 * Renders the drag preview for board games as a portal to document.body.
 * Completely bypasses dnd-kit's DragOverlay to avoid positioning conflicts.
 * Centers the overlay on the cursor position for intuitive drag feel.
 *
 * Key features:
 * - Portal rendering to document.body for clean stacking context
 * - Centered on cursor (not top-left corner)
 * - Smooth size transitions when orientation changes
 * - Supports variable game sizes via getGameDimensions
 * - Art rotates 90° for horizontal orientation
 */

import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import type { LibraryGameView, CellOrientation } from '../../types/library';
import { SHELF_SCALE, getGameDimensions } from '../../types/library';

export type DragOverlayOrientation = CellOrientation | 'square';


interface CustomDragOverlayProps {
  game: LibraryGameView;
  orientation: DragOverlayOrientation;
  /** Base cell size in pixels for scaling calculations */
  baseSize: number;
  /** Cursor position - overlay will be centered on this point */
  position: { x: number; y: number };
}

export function CustomDragOverlay({
  game,
  orientation,
  baseSize,
  position,
}: CustomDragOverlayProps) {
  // Get game dimensions for aspect ratio calculation
  const dims = getGameDimensions(game);

  // Focal point for object-position (defaults to center)
  // Same focal point used for all orientations - the rotation handles the visual change
  const focalX = game.focalPointX ?? 50;
  const focalY = game.focalPointY ?? 50;
  const objectPosition = `${focalX}% ${focalY}%`;

  // Calculate overlay dimensions based on orientation
  let width: number;
  let height: number;
  const isHorizontal = orientation === 'horizontal';

  if (orientation === 'square') {
    // Square preview for unplaced panel - slightly smaller
    width = baseSize * 0.8;
    height = baseSize * 0.8;
  } else if (orientation === 'vertical') {
    // Vertical: width for X, depth (spine) for Y
    const widthRatio = dims.widthCm / SHELF_SCALE.cellSizeCm;
    const depthRatio = dims.depthCm / SHELF_SCALE.cellSizeCm;
    // Clamp ratios to reasonable bounds
    const clampedWidth = Math.max(0.3, Math.min(1, widthRatio));
    const clampedDepth = Math.max(0.15, Math.min(1, depthRatio));
    width = baseSize * clampedWidth;
    height = baseSize * clampedDepth;
  } else {
    // Horizontal (lying flat): depth for X (stacking), width for Y (perpendicular)
    const depthRatio = dims.depthCm / SHELF_SCALE.cellSizeCm;
    const widthRatio = dims.widthCm / SHELF_SCALE.cellSizeCm;
    // Clamp ratios to reasonable bounds
    const clampedDepth = Math.max(0.15, Math.min(1, depthRatio));
    const clampedWidth = Math.max(0.3, Math.min(1, widthRatio));
    width = baseSize * clampedDepth;
    height = baseSize * clampedWidth;
  }

  const overlayContent = (
    <div
      className="rounded-[1px] shadow-xl overflow-hidden"
      style={{
        position: 'fixed',
        // Center the overlay on the cursor
        left: position.x - width / 2,
        top: position.y - height / 2,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 9999,
        // Smooth size transitions when orientation changes
        transition: 'width 150ms ease-out, height 150ms ease-out',
        // 3D depth effect: drop shadow + edge highlights via inset shadows (top-left light source)
        boxShadow: `
          4px 6px 12px rgba(0,0,0,0.4),
          2px 3px 4px rgba(0,0,0,0.25),
          inset 1px 1px 0 rgba(255,255,255,0.2),
          inset -1px -1px 0 rgba(0,0,0,0.15)
        `,
      }}
    >
      {game.gameThumbnail ? (
        isHorizontal ? (
          /* For horizontal: create a wrapper with the same dimensions as vertical (width x depth),
             apply object-cover and objectPosition for consistent cropping, then rotate -90deg.
             After rotation, this fills the horizontal container (depth x width) exactly. */
          <div className="w-full h-full relative overflow-hidden">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
              style={{
                // Inner matches vertical shape: width proportional to game width, height to depth
                // Parent is (depth x width), so convert to parent-relative percentages
                width: `${(dims.widthCm / dims.depthCm) * 100}%`,
                height: `${(dims.depthCm / dims.widthCm) * 100}%`,
              }}
            >
              <img
                src={game.gameThumbnail}
                alt={game.gameName}
                className="w-full h-full object-cover"
                style={{ objectPosition }}
                draggable={false}
              />
            </div>
          </div>
        ) : (
          <img
            src={game.gameThumbnail}
            alt={game.gameName}
            className="w-full h-full object-cover"
            style={{ objectPosition }}
            draggable={false}
          />
        )
      ) : (
        <div className={cn(
          'w-full h-full bg-gradient-to-br from-amber-200 to-amber-300 flex items-center justify-center',
          isHorizontal && '-rotate-90'
        )}>
          <span className="text-amber-800 text-xs font-bold text-center px-1 line-clamp-2">
            {game.gameName.slice(0, 15)}
          </span>
        </div>
      )}
    </div>
  );

  return createPortal(overlayContent, document.body);
}
