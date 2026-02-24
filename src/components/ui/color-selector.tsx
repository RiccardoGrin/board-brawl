import { useState, useRef, useEffect } from 'react';
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";
import { Plus } from 'lucide-react';
import { PREDEFINED_COLORS } from '../../utils/colors';
import { cn } from '../../utils/cn';

interface ColorSelectorProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ColorSelector({ color, onChange, className, disabled = false }: ColorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // State for the custom color picker
  const [customColor, setCustomColor] = useColor(color);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Update custom picker state when prop changes or picker opens
  useEffect(() => {
    if (isOpen) {
        setCustomColor(prev => ({...prev, hex: color}));
    }
  }, [color, isOpen, setCustomColor]);

  // Handle color change from custom picker
  const handleCustomChange = (newColor: any) => {
    setCustomColor(newColor);
    onChange(newColor.hex);
  };

  const handleTriggerClick = () => {
    if (!disabled) {
        setIsOpen(!isOpen);
    }
  }

  const colorsToDisplay = PREDEFINED_COLORS.slice(0, -1);

  return (
    <div className={cn("relative", className)} ref={popoverRef}>
      {/* Trigger */}
      <div 
        className={cn(
            "w-8 h-8 rounded-full border-2 border-gray-200 shadow-sm",
            !disabled && "cursor-pointer hover:scale-105 transition-transform"
        )}
        style={{ backgroundColor: color }}
        onClick={handleTriggerClick}
      />

      {/* Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 card-medieval p-3 z-[60] w-64">
           {!showCustomPicker ? (
               <>
                <div className="mb-2 text-xs font-bold text-muted engraved uppercase tracking-wider">
                    Preset Colors
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
                             // Highlight the plus button if the current color is not in the predefined list
                            !PREDEFINED_COLORS.includes(color) ? "border-ink" : "border-transparent"
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
             </div>
           )}
        </div>
      )}
    </div>
  );
}
