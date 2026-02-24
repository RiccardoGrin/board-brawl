import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
  headerClassName?: string;
  preventClose?: boolean; // Block backdrop/Escape closes
  onAttemptClose?: () => void; // Called when close is blocked
}

export function Modal({ isOpen, onClose, title, children, footer, contentClassName, headerClassName, preventClose, onAttemptClose }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle close attempts - respects preventClose prop
  const handleCloseAttempt = useCallback(() => {
    if (preventClose) {
      onAttemptClose?.();
    } else {
      onClose();
    }
  }, [preventClose, onAttemptClose, onClose]);

  // Focus trap: get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseAttempt();
    };

    // Focus trap handler
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('keydown', handleTab);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleCloseAttempt, getFocusableElements]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-ink/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleCloseAttempt}
      role="presentation"
    >
      <div 
        ref={modalRef}
        className="card-medieval bg-white w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-main"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className={headerClassName || "flex items-center justify-between px-8 py-6 border-b border-border-2"}>
          <h3 id="modal-title" className="text-xl font-bold text-ink engraved">{title}</h3>
          <button
            onClick={handleCloseAttempt}
            className="text-muted hover:text-ink transition-colors p-1"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className={contentClassName || "px-8 py-8"}>
          {children}
        </div>

        {footer && (
          <div className="px-8 py-6 bg-paper-2/30 border-t border-border-2 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
