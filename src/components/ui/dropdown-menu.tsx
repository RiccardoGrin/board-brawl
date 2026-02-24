import { useState, useRef, useLayoutEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../utils/cn';

export interface DropdownMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface DropdownMenuProps {
  /** Menu items to display */
  items: DropdownMenuItem[];
  /** Aria label for the menu button */
  ariaLabel: string;
  /** Whether to use portal for rendering (escapes overflow containers) */
  usePortal?: boolean;
  /** Whether button should always be visible on mobile */
  alwaysVisibleOnMobile?: boolean;
  /** Additional CSS classes for the button container */
  className?: string;
}

/**
 * Reusable dropdown menu component with three-dot trigger button.
 * 
 * Features:
 * - Consistent styling across all menus
 * - Optional portal rendering for overflow escape
 * - Automatic positioning and click-outside handling
 * - Keyboard support (Escape to close)
 * - Accessibility with ARIA attributes
 * 
 * @example
 * ```tsx
 * <DropdownMenu
 *   ariaLabel="Game actions"
 *   usePortal={true}
 *   items={[
 *     { label: 'Edit', icon: <Edit2 className="w-4 h-4" />, onClick: handleEdit },
 *     { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: handleDelete, variant: 'danger' }
 *   ]}
 * />
 * ```
 */
export function DropdownMenu({
  items,
  ariaLabel,
  usePortal = false,
  alwaysVisibleOnMobile = true,
  className,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  /**
   * Calculate dropdown menu position based on the button's position.
   * Used for portal-based menus.
   */
  const updateMenuPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4, // 4px gap below button
        right: window.innerWidth - rect.right, // Align right edge with button
      });
    }
  }, []);

  // Handle menu positioning and cleanup for portal menus
  useLayoutEffect(() => {
    if (isOpen && usePortal) {
      updateMenuPosition();

      // Close menu on scroll for better UX
      const handleScroll = () => setIsOpen(false);
      const handleResize = () => updateMenuPosition();

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    } else if (!isOpen) {
      setMenuPosition(null);
    }
  }, [isOpen, usePortal, updateMenuPosition]);

  // Handle click-outside and Escape key for non-portal menus
  useLayoutEffect(() => {
    if (!isOpen || usePortal) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, usePortal]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleItemClick = (onClick: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    onClick();
  };

  // Menu content JSX
  const menuContent = (
    <div
      role="menu"
      aria-label={ariaLabel}
      className="card-medieval bg-white shadow-main p-1.5 w-36"
      style={usePortal && menuPosition ? {
        position: 'fixed',
        top: `${menuPosition.top}px`,
        right: `${menuPosition.right}px`,
        zIndex: 101,
      } : {
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: '0.5rem',
        zIndex: 50,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={handleItemClick(item.onClick)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors',
            item.variant === 'danger'
              ? 'text-red-600 hover:bg-red-50'
              : 'text-ink hover:bg-gold-2/10'
          )}
          role="menuitem"
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className={cn(
          'h-8 w-8 text-muted hover:text-ink transition-opacity',
          alwaysVisibleOnMobile ? 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        )}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <MoreVertical className="w-4 h-4" />
      </Button>

      {/* Render menu with or without portal */}
      {isOpen && (
        usePortal && menuPosition ? (
          createPortal(
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-[100]"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                aria-hidden="true"
              />
              {menuContent}
            </>,
            document.body
          )
        ) : (
          menuContent
        )
      )}
    </div>
  );
}

