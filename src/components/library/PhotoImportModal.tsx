/**
 * Photo Import Modal
 *
 * Allows users to upload a photo of their board game shelf and
 * automatically detect games using AI to import them into their library.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera,
  Upload,
  X,
  AlertCircle,
  CheckCircle,
  Plus,
  Loader2,
  ImageIcon,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import {
  importFromPhoto,
  isValidImageFile,
  formatFileSize,
  type ImportStep,
  type ImportedGame,
  type PhotoImportResult,
} from '../../services/photoImport';
import type { GameDetection } from '../../services/gameSearch';
import type { LibraryId, Library } from '../../types/library';
import { cn } from '../../utils/cn';

interface PhotoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (games: ImportedGame[], targetLibraryId: LibraryId) => void;
  libraries: Library[];
  defaultLibraryId: LibraryId;
  existingGameIds: Set<string>;
}

type ModalStep = 'upload' | 'processing' | 'results';

/**
 * Human-readable labels for import steps
 */
const STEP_LABELS: Record<ImportStep, string> = {
  compressing: 'Preparing image...',
  analyzing: 'Analyzing shelf photo...',
  matching: 'Matching games...',
  complete: 'Complete!',
  error: 'Error',
};

export function PhotoImportModal({
  isOpen,
  onClose,
  onImport,
  libraries,
  defaultLibraryId,
  existingGameIds,
}: PhotoImportModalProps) {
  // State
  const [step, setStep] = useState<ModalStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>('compressing');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PhotoImportResult | null>(null);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [targetLibraryId, setTargetLibraryId] = useState<LibraryId>(defaultLibraryId);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Determine if we should prevent accidental close
  const shouldPreventClose = step !== 'upload' || selectedFile !== null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync target library when modal opens or default changes
  useEffect(() => {
    if (isOpen && defaultLibraryId) {
      setTargetLibraryId(defaultLibraryId);
    }
  }, [isOpen, defaultLibraryId]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setPreviewUrl(null);
    setImportStep('compressing');
    setProgress(0);
    setResults(null);
    setSelectedGames(new Set());
    setTargetLibraryId(defaultLibraryId);
    setError(null);
    setShowConfirmClose(false);
    onClose();
  }, [onClose, defaultLibraryId]);

  // Handle attempted close when there's progress to lose
  const handleAttemptClose = useCallback(() => {
    if (step === 'processing') return; // Cannot close during processing
    setShowConfirmClose(true);
  }, [step]);

  // Confirm discarding progress
  const handleConfirmClose = useCallback(() => {
    setShowConfirmClose(false);
    handleClose();
  }, [handleClose]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!isValidImageFile(file)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
    setError(null);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Process the photo
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return;

    setStep('processing');
    setProgress(0);
    setError(null);

    try {
      const result = await importFromPhoto(selectedFile, (importStep, percent) => {
        setImportStep(importStep);
        setProgress(percent);
      });

      setResults(result);

      // Pre-select all matched games that aren't already in the library
      const preSelected = new Set<string>();
      for (const match of result.matched) {
        if (!existingGameIds.has(match.game.gameId)) {
          preSelected.add(match.game.gameId);
        }
      }
      setSelectedGames(preSelected);

      setStep('results');
    } catch (err: any) {
      setError(err.message || 'Failed to analyze photo');
      setStep('upload');
    }
  }, [selectedFile, existingGameIds]);

  // Toggle game selection
  const toggleGameSelection = useCallback((gameId: string) => {
    setSelectedGames((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  }, []);

  // Handle import
  const handleImport = useCallback(() => {
    if (!results) return;

    const gamesToImport = results.matched.filter((g) => selectedGames.has(g.game.gameId));
    onImport(gamesToImport, targetLibraryId);
    handleClose();
  }, [results, selectedGames, targetLibraryId, onImport, handleClose]);

  // Render upload step
  const renderUploadStep = () => (
    <div className="space-y-6">
      {/* Photo upload area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          selectedFile
            ? 'border-gold bg-gold/5'
            : 'border-gold-2/40 hover:border-gold-2 hover:bg-paper-2/30',
          'cursor-pointer'
        )}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label="Upload photo"
      >
        {previewUrl ? (
          <div className="space-y-4">
            <img
              src={previewUrl}
              alt="Selected shelf photo"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
            <div className="text-sm text-muted">
              {selectedFile?.name} ({formatFileSize(selectedFile?.size || 0)})
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setPreviewUrl(null);
              }}
            >
              <X className="w-4 h-4 mr-1" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-gold" />
            </div>
            <div>
              <p className="text-base font-medium text-ink">Drop your shelf photo here</p>
              <p className="text-sm text-muted mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-muted">Supports JPEG, PNG, GIF, WebP (max 7MB)</p>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Camera capture button (mobile) */}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Photo
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="w-4 h-4 mr-2" />
          Take Photo
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="divider-line" />
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleAnalyze} disabled={!selectedFile}>
          <Sparkles className="w-4 h-4 mr-1" />
          Analyze Photo
        </Button>
      </div>
    </div>
  );

  // Render processing step
  const renderProcessingStep = () => (
    <div className="py-8 text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gold animate-spin" />
      </div>

      <div>
        <p className="text-lg font-medium text-ink">{STEP_LABELS[importStep]}</p>
        <p className="text-sm text-muted mt-1">This may take a moment</p>
      </div>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-2 bg-paper-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted mt-2">{progress}%</p>
      </div>
    </div>
  );

  // Render results step
  const renderResultsStep = () => {
    if (!results) return null;

    const selectedCount = selectedGames.size;
    const alreadyInLibraryCount = results.matched.filter((g) =>
      existingGameIds.has(g.game.gameId)
    ).length;

    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="bg-paper-2/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green" />
            <span className="font-medium text-ink">
              Found {results.totalDetected} game{results.totalDetected !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-muted">
            {results.matched.length} matched to BoardGameGeek
            {results.unmatched.length > 0 && `, ${results.unmatched.length} unmatched`}
            {alreadyInLibraryCount > 0 && ` (${alreadyInLibraryCount} already in library)`}
          </p>
        </div>

        {/* Library selector */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Add to library</label>
          <select
            value={targetLibraryId}
            onChange={(e) => setTargetLibraryId(e.target.value)}
            className="w-full px-3 py-2 border border-gold-2/30 rounded-lg bg-white text-ink focus:outline-none focus:border-gold"
          >
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>
        </div>

        {/* Game list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-ink">
              Select games to import ({selectedCount} selected)
            </label>
            {results.matched.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selectedGames.size === results.matched.length - alreadyInLibraryCount) {
                    setSelectedGames(new Set());
                  } else {
                    const all = new Set<string>();
                    for (const m of results.matched) {
                      if (!existingGameIds.has(m.game.gameId)) {
                        all.add(m.game.gameId);
                      }
                    }
                    setSelectedGames(all);
                  }
                }}
              >
                {selectedGames.size === results.matched.length - alreadyInLibraryCount
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
            )}
          </div>

          {/* Matched games */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {results.matched.map((match) => {
              const isAlreadyInLibrary = existingGameIds.has(match.game.gameId);
              const isSelected = selectedGames.has(match.game.gameId);

              return (
                <label
                  key={match.game.gameId}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                    isAlreadyInLibrary
                      ? 'bg-paper-2/50 border-gold-2/20 opacity-60 cursor-not-allowed'
                      : isSelected
                        ? 'border-gold bg-gold/5'
                        : 'border-gold-2/30 hover:border-gold-2'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isAlreadyInLibrary}
                    onChange={() => toggleGameSelection(match.game.gameId)}
                    className="w-4 h-4 rounded border-gold-2 text-gold focus:ring-gold"
                  />

                  {/* Thumbnail */}
                  {match.game.thumbnail ? (
                    <img
                      src={match.game.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-paper-2 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-muted" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink truncate">{match.game.primaryName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {match.game.year && <span>{match.game.year}</span>}
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded-full',
                          match.confidence >= 0.9
                            ? 'bg-green/10 text-green'
                            : match.confidence >= 0.7
                              ? 'bg-gold/10 text-gold'
                              : 'bg-paper-2 text-muted'
                        )}
                      >
                        {Math.round(match.confidence * 100)}%
                      </span>
                      {isAlreadyInLibrary && (
                        <span className="text-muted italic">Already in library</span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}

            {/* Unmatched games */}
            {results.unmatched.length > 0 && (
              <div className="pt-2 border-t border-gold-2/30">
                <p className="text-sm text-muted mb-2">Couldn't match these games:</p>
                {results.unmatched.map((detection: GameDetection, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 text-sm text-muted opacity-60"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">{detection.name}</span>
                    <span className="text-xs">{Math.round(detection.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="divider-line" />
        <div className="flex justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep('upload')}>
            Back
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={selectedCount === 0}>
              <Plus className="w-4 h-4 mr-1" />
              Add {selectedCount} Game{selectedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Determine title based on step
  const titles: Record<ModalStep, string> = {
    upload: 'Import from Photo',
    processing: 'Analyzing...',
    results: 'Review Detected Games',
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={titles[step]}
        contentClassName={step === 'results' ? 'px-6 py-6' : 'px-8 py-8'}
        preventClose={shouldPreventClose}
        onAttemptClose={handleAttemptClose}
      >
        {step === 'upload' && renderUploadStep()}
        {step === 'processing' && renderProcessingStep()}
        {step === 'results' && renderResultsStep()}
      </Modal>

      {/* Confirmation dialog for discarding progress */}
      <Modal
        isOpen={showConfirmClose}
        onClose={() => setShowConfirmClose(false)}
        title="Discard Progress?"
      >
        <div className="space-y-6">
          <p className="text-base text-muted">
            You'll lose your detected games and selections.
          </p>
          <div className="divider-line" />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowConfirmClose(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClose}>
              Discard
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
