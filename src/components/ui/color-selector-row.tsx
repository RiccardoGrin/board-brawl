import { useState, useRef, useEffect } from 'react';
import { ColorPicker, useColor, type IColor } from "react-color-palette";
import "react-color-palette/css";
import { Plus } from 'lucide-react';
import { cn } from '../../utils/cn';

// Shelf-appropriate colors: wood tones, neutrals, and classic finishes
const SHELF_COLORS = [
  // Neutrals
  '#FFFFFF', // White
  '#F5F5F5', // Off-white
  '#9CA3AF', // Gray
  '#4B5563', // Dark gray
  '#1F2937', // Charcoal
  '#000000', // Black
  // Wood tones
  '#D4A574', // Light oak
  '#C8A882', // Burlywood (default backing)
  '#8B4513', // Saddle brown (default frame)
  '#A0522D', // Sienna
  '#6B4423', // Dark walnut
  '#3D2314', // Espresso
];

interface ColorSelectorRowProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
}

interface PopoverPosition {
  left: number;
  top: number;
}

/**
 * A menu-friendly color selector that shows a color swatch with a label.
 * Clicking opens a color picker popover positioned to avoid clipping.
 */
export function ColorSelectorRow({ label, color, onChange }: ColorSelectorRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // State for the custom color picker
  const [customColor, setCustomColor] = useColor(color);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Update custom picker state when prop changes or picker opens
  useEffect(() => {
    if (isOpen) {
      setCustomColor(prev => ({...prev, hex: color}));
    }
  }, [color, isOpen, setCustomColor]);

  // Handle color change from custom picker
  const handleCustomChange = (newColor: IColor) => {
    setCustomColor(newColor);
    onChange(newColor.hex);
  };

  // Calculate popover position when opening
  const handleOpen = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 256; // w-64
    const popoverHeight = 200; // approximate

    let left = rect.left;
    let top = rect.bottom + 8;

    // Check right edge
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }

    // Check bottom edge - flip to above if needed
    if (top + popoverHeight > window.innerHeight - 16) {
      top = rect.top - popoverHeight - 8;
    }

    setPopoverPosition({ left, top });
    setIsOpen(true);
    setShowCustomPicker(false);
  };

  const colorsToDisplay = SHELF_COLORS;

  return (
    <div className="relative">
      {/* Trigger row */}
      <button
        ref={triggerRef}
        type="button"
        className="w-full flex items-center gap-3 py-1.5 text-left hover:opacity-80 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
            setShowCustomPicker(false);
          } else {
            handleOpen();
          }
        }}
      >
        <div
          className="w-5 h-5 rounded-full border-2 border-gray-300 shadow-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-ink">{label}</span>
      </button>

      {/* Popover */}
      {isOpen && popoverPosition && (
        <div
          ref={popoverRef}
          className="card-medieval p-3 z-[60] w-64"
          style={{
            position: 'fixed',
            left: `${popoverPosition.left}px`,
            top: `${popoverPosition.top}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!showCustomPicker ? (
            <>
              <div className="mb-2 text-xs font-bold text-muted engraved uppercase tracking-wider">
                {label}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {colorsToDisplay.map(c => (
                  <div
                    key={c}
                    className={cn(
                      "w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform border-2",
                      color === c ? "border-ink" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      onChange(c);
                      setIsOpen(false);
                    }}
                  />
                ))}
                <button
                  type="button"
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center bg-paper text-muted hover:bg-paper-2 hover:text-ink transition-colors border-2",
                    !SHELF_COLORS.includes(color) ? "border-ink" : "border-transparent"
                  )}
                  onClick={() => setShowCustomPicker(true)}
                  title="Custom Color"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="custom-color-picker-wrapper">
                <ColorPicker
                  hideInput={["rgb", "hsv", "hex"]}
                  hideAlpha
                  height={100}
                  color={customColor}
                  onChange={handleCustomChange}
                />
              </div>
              <button
                type="button"
                className="text-sm text-muted hover:text-ink transition-colors"
                onClick={() => setShowCustomPicker(false)}
              >
                Back to presets
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
