/**
 * Photo Import Service
 *
 * Orchestrates the AI-powered photo import workflow:
 * 1. Image preprocessing (compression, base64 encoding)
 * 2. Calls Gemini Vision Cloud Function for game detection
 * 3. Matches detected names to BGG games
 * 4. Returns results for user review
 */

import {
  matchDetectedGames,
  type GameDetection,
  type MatchedGame,
  type GameRecord,
} from './gameSearch';
import { auth } from '../lib/firebase';

// ============================================================================
// Types
// ============================================================================

/**
 * Progress callback for import process
 */
export type ImportProgressCallback = (step: ImportStep, percent: number) => void;

/**
 * Steps in the import process
 */
export type ImportStep =
  | 'compressing'
  | 'analyzing'
  | 'matching'
  | 'complete'
  | 'error';

/**
 * Result of the photo import process
 */
export interface PhotoImportResult {
  /** Games that were successfully matched to BGG records */
  matched: ImportedGame[];
  /** Game names that couldn't be matched */
  unmatched: GameDetection[];
  /** Total games detected by AI */
  totalDetected: number;
}

/**
 * A game ready to be imported
 */
export interface ImportedGame {
  /** The detected name from the photo */
  detectedName: string;
  /** AI confidence (0-1) */
  confidence: number;
  /** The matched game record */
  game: GameRecord;
  /** How well the name matched (0-1) */
  matchScore: number;
}

// ============================================================================
// Image Processing
// ============================================================================

/**
 * Maximum image dimension (width or height) after compression
 */
const MAX_IMAGE_DIMENSION = 1920;

/**
 * Target file size in bytes (~1MB)
 */
const TARGET_SIZE_BYTES = 1024 * 1024;

/**
 * Compresses an image file for upload.
 * Resizes to max 1920px and compresses to ~1MB JPEG.
 *
 * @param file - The image file to compress
 * @returns Base64 encoded image with data URL prefix
 */
export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to create canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;

      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Start with high quality and reduce if needed
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);

      // Reduce quality until file size is acceptable
      while (result.length > TARGET_SIZE_BYTES * 1.4 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }

      resolve(result);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Load the image
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Cloud Function Integration
// ============================================================================

/**
 * Gets the URL for the processShelfPhoto Cloud Function
 */
function getProcessShelfPhotoUrl(): string {
  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const explicit = import.meta.env.VITE_PROCESS_SHELF_PHOTO_URL;

  if (explicit) return explicit;
  if (projectId) {
    return `https://${region}-${projectId}.cloudfunctions.net/processShelfPhoto`;
  }
  throw new Error('Missing VITE_PROCESS_SHELF_PHOTO_URL or VITE_FIREBASE_PROJECT_ID');
}

/**
 * Calls the Gemini Vision Cloud Function to analyze a shelf photo.
 * Requires authentication - the current user's ID token is sent with the request.
 *
 * @param imageBase64 - Base64 encoded image (with or without data URL prefix)
 * @returns Array of detected game names with confidence scores
 */
async function analyzeShelfPhoto(imageBase64: string): Promise<GameDetection[]> {
  const url = getProcessShelfPhotoUrl();

  // Get the current user's ID token for authentication
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to use this feature');
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Authentication required. Please sign in again.');
    }
    if (response.status === 403) {
      throw new Error('Access denied. This feature requires admin or premium access.');
    }
    throw new Error(errorData.error || `Failed to analyze photo: ${response.status}`);
  }

  const data = await response.json();
  return data.games || [];
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Imports games from a photo of a board game shelf.
 *
 * Workflow:
 * 1. Compresses the image (0-20% progress)
 * 2. Sends to Gemini Vision for analysis (20-40% progress)
 * 3. Matches detected names to BGG games (40-95% progress)
 * 4. Returns results for user review (100%)
 *
 * @param imageFile - The photo file to analyze
 * @param onProgress - Optional callback for progress updates
 * @returns Import results with matched games and unmatched detections
 */
export async function importFromPhoto(
  imageFile: File,
  onProgress?: ImportProgressCallback
): Promise<PhotoImportResult> {
  try {
    // Step 1: Compress image
    onProgress?.('compressing', 5);
    const compressedImage = await compressImage(imageFile);
    onProgress?.('compressing', 20);

    // Step 2: Send to Gemini Vision
    onProgress?.('analyzing', 25);
    const detections = await analyzeShelfPhoto(compressedImage);
    onProgress?.('analyzing', 40);

    if (detections.length === 0) {
      onProgress?.('complete', 100);
      return {
        matched: [],
        unmatched: [],
        totalDetected: 0,
      };
    }

    // Step 3: Match detected names to BGG games
    onProgress?.('matching', 45);
    const matchingResult = await matchDetectedGames(
      detections,
      (matched, total) => {
        // Map matching progress to 45-95%
        const percent = 45 + Math.round((matched / total) * 50);
        onProgress?.('matching', percent);
      }
    );

    // Transform results
    const matched: ImportedGame[] = matchingResult.matched.map((m: MatchedGame) => ({
      detectedName: m.detection.name,
      confidence: m.detection.confidence,
      game: m.game,
      matchScore: m.matchScore,
    }));

    onProgress?.('complete', 100);

    return {
      matched,
      unmatched: matchingResult.unmatched,
      totalDetected: detections.length,
    };
  } catch (error) {
    onProgress?.('error', 0);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates that a file is a supported image type
 */
export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return validTypes.includes(file.type);
}

/**
 * Gets a human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
