/**
 * Gemini Vision Cloud Function for AI Photo Import
 *
 * Analyzes photos of board game shelves using Google's Gemini 2.0 Flash model
 * to detect game names from box spines and covers.
 *
 * Usage:
 * - POST /processShelfPhoto
 * - Body: { image: string } (base64 encoded image)
 * - Headers: Authorization: Bearer <Firebase ID Token>
 * - Returns: { games: { name: string, confidence: number }[] }
 *
 * Access Control:
 * - Requires authentication via Firebase ID Token
 * - User must have accountTier 'admin' or 'premium', or 'aiPhotoImport' feature flag
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Gemini API key stored in Firebase secrets
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Initialize Firebase Admin if not already initialized
// Note: admin.initializeApp() is called in index.ts, but we need to handle
// cases where this module is loaded first
const getDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

/**
 * Verify Firebase ID token and check feature access.
 * Returns the user's UID if authorized, or throws an error.
 */
async function verifyFeatureAccess(authHeader: string | undefined): Promise<string> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const idToken = authHeader.split("Bearer ")[1];
  if (!idToken) {
    throw new Error("UNAUTHORIZED");
  }

  // Verify the Firebase ID token
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    throw new Error("UNAUTHORIZED");
  }

  const uid = decodedToken.uid;

  // Look up the user's profile in Firestore
  const db = getDb();
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    throw new Error("FORBIDDEN");
  }

  const userData = userDoc.data();
  const accountTier = userData?.accountTier;
  const features: string[] = userData?.features || [];

  // Check access: admin, premium, or specific feature flag
  const hasAccess =
    accountTier === "admin" ||
    accountTier === "premium" ||
    features.includes("aiPhotoImport");

  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }

  return uid;
}

// CORS configuration (same as other functions)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ??
  "https://board-brawl.com,https://boardbrawl.web.app,https://boardbrawl.firebaseapp.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowCors = (req: any, res: any) => {
  const origin = req.headers.origin;
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  res.set("Access-Control-Allow-Origin", isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

/**
 * Detection result from Gemini Vision
 */
interface GameDetection {
  name: string;
  confidence: number;
}

/**
 * Gemini API request types
 */
interface GeminiContent {
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    topK: number;
    topP: number;
    maxOutputTokens: number;
    responseMimeType: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * The prompt for Gemini to analyze shelf photos
 */
const ANALYSIS_PROMPT = `You are analyzing a photo of a board game shelf or collection.
Your task is to identify all BOARD GAME and CARD GAME titles visible on game box spines, covers, or packaging.

Instructions:
1. Look carefully at all visible game boxes, including partially visible ones
2. Identify games by their titles on spines or box fronts
3. Only include games you can clearly identify - skip uncertain ones
4. **Use the FULL game title including any subtitle, edition, or version name printed on the box:**
   - "Heat: Pedal to the Metal" NOT just "Heat"
   - "Ticket to Ride: Europe" NOT just "Ticket to Ride" (if it's the Europe edition)
   - "Carcassonne: Hunters and Gatherers" NOT just "Carcassonne" (if it's the standalone game)
   - "Wingspan: Oceania Expansion" for expansions
   - "Pandemic Legacy: Season 1" for legacy versions
5. Include expansions if clearly labeled (e.g., "Catan: Seafarers")
6. **IMPORTANT: List games in reading order - start from the top-left of the shelf, move right across each row, then continue with the next row below. If there are games outside the main shelf area (on top, beside, or in front), add them at the end of the list.**
7. **ONLY include board games and card games. DO NOT include:**
   - Books (strategy guides, rulebooks, novels, etc.)
   - DVDs, Blu-rays, or video games
   - Puzzles (jigsaw puzzles)
   - Toys (Rubik's cubes, action figures, etc.)
   - Other non-game items on the shelf

Return a JSON array of objects with:
- "name": The COMPLETE game title as printed on the box (including subtitle/edition)
- "confidence": Your confidence level from 0.0 to 1.0 (1.0 = absolutely certain, 0.7 = fairly confident, 0.5 = uncertain)

Example output:
[
  {"name": "Heat: Pedal to the Metal", "confidence": 0.95},
  {"name": "Ticket to Ride: Europe", "confidence": 0.9},
  {"name": "Pandemic Legacy: Season 1", "confidence": 0.85},
  {"name": "Azul: Summer Pavilion", "confidence": 0.7}
]

If no games are visible or identifiable, return an empty array: []

Important: Return ONLY the JSON array, no other text or formatting.`;

/**
 * Validates and parses the base64 image data
 * Accepts both raw base64 and data URL format
 */
function parseImageData(image: string): { data: string; mimeType: string } | null {
  // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
  if (image.startsWith("data:")) {
    const matches = image.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return {
        mimeType: matches[1],
        data: matches[2],
      };
    }
    return null;
  }

  // Raw base64 - try to detect MIME type from magic bytes
  try {
    // First few bytes of base64 can indicate image type
    const firstChars = image.substring(0, 4);
    let mimeType = "image/jpeg"; // default

    if (firstChars.startsWith("/9j/")) {
      mimeType = "image/jpeg";
    } else if (firstChars.startsWith("iVBO")) {
      mimeType = "image/png";
    } else if (firstChars.startsWith("R0lG")) {
      mimeType = "image/gif";
    } else if (firstChars.startsWith("UklG")) {
      mimeType = "image/webp";
    }

    return { data: image, mimeType };
  } catch {
    return null;
  }
}

/**
 * Calls Gemini API to analyze the shelf image
 */
async function analyzeShelfImage(
  imageData: string,
  mimeType: string,
  apiKey: string
): Promise<GameDetection[]> {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  const request: GeminiRequest = {
    contents: [
      {
        parts: [
          { text: ANALYSIS_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageData,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2, // Lower temperature for more consistent results
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json() as GeminiResponse;

  // Extract the text response from Gemini
  const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    console.error("No text content in Gemini response:", JSON.stringify(result));
    return [];
  }

  // Parse the JSON response
  try {
    // Clean up the response - sometimes Gemini adds markdown formatting
    let cleanJson = textContent.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const detections = JSON.parse(cleanJson);

    // Validate and sanitize the response
    if (!Array.isArray(detections)) {
      console.error("Gemini response is not an array:", cleanJson);
      return [];
    }

    return detections
      .filter(
        (d: any) =>
          typeof d.name === "string" &&
          d.name.trim() !== "" &&
          typeof d.confidence === "number" &&
          d.confidence >= 0 &&
          d.confidence <= 1
      )
      .map((d: any) => ({
        name: d.name.trim(),
        confidence: Math.round(d.confidence * 100) / 100, // Round to 2 decimal places
      }));
  } catch (parseError) {
    console.error("Failed to parse Gemini response:", textContent, parseError);
    return [];
  }
}

/**
 * Deduplicates detected games, keeping the highest confidence for each
 */
function deduplicateDetections(detections: GameDetection[]): GameDetection[] {
  const gameMap = new Map<string, GameDetection>();

  for (const detection of detections) {
    const normalizedName = detection.name.toLowerCase().trim();
    const existing = gameMap.get(normalizedName);

    if (!existing || detection.confidence > existing.confidence) {
      gameMap.set(normalizedName, detection);
    }
  }

  return Array.from(gameMap.values());
}

/**
 * Cloud Function: processShelfPhoto
 *
 * Analyzes a photo of a board game shelf and returns detected game names.
 *
 * Request body:
 * - image: string (base64 encoded image, with or without data URL prefix)
 *
 * Response:
 * - games: Array of { name: string, confidence: number }
 * - count: number of games detected
 */
export const processShelfPhoto = onRequest(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 60, // Allow up to 60s for image analysis
    memory: "256MiB",
  },
  async (req, res) => {
    allowCors(req, res);

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify authentication and feature access
    try {
      const uid = await verifyFeatureAccess(req.headers.authorization);
      console.log(`[processShelfPhoto] Authorized user: ${uid}`);
    } catch (error: any) {
      if (error.message === "UNAUTHORIZED") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (error.message === "FORBIDDEN") {
        res.status(403).json({ error: "Access denied. This feature requires admin or premium access." });
        return;
      }
      console.error("[processShelfPhoto] Auth error:", error);
      res.status(500).json({ error: "Authentication error" });
      return;
    }

    // Validate API key is configured
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured");
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    // Parse request body
    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "Missing or invalid image data" });
      return;
    }

    // Validate image size (rough check - base64 is ~1.33x original size)
    // Allow up to ~10MB base64 which is ~7.5MB image
    if (image.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Image too large. Maximum size is 7MB." });
      return;
    }

    // Parse the image data
    const parsedImage = parseImageData(image);
    if (!parsedImage) {
      res.status(400).json({ error: "Invalid image format" });
      return;
    }

    // Validate MIME type
    const validMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validMimeTypes.includes(parsedImage.mimeType)) {
      res.status(400).json({
        error: `Unsupported image format: ${parsedImage.mimeType}. Supported: JPEG, PNG, GIF, WebP`,
      });
      return;
    }

    try {
      console.log(`[processShelfPhoto] Analyzing image (${parsedImage.mimeType}, ${Math.round(image.length / 1024)}KB)`);

      // Call Gemini Vision API
      const detections = await analyzeShelfImage(
        parsedImage.data,
        parsedImage.mimeType,
        apiKey
      );

      // Deduplicate results (preserves spatial ordering from Gemini)
      const uniqueDetections = deduplicateDetections(detections);

      // Note: No longer sorting by confidence to preserve spatial ordering from Gemini
      // Games are returned in reading order (top-left to bottom-right)

      console.log(`[processShelfPhoto] Detected ${uniqueDetections.length} games`);

      res.json({
        games: uniqueDetections,
        count: uniqueDetections.length,
      });
    } catch (error: any) {
      console.error("[processShelfPhoto] Error:", error);

      // Return appropriate error response
      if (error.message?.includes("API error")) {
        res.status(502).json({
          error: "Failed to analyze image. Please try again.",
          detail: error.message,
        });
      } else {
        res.status(500).json({
          error: "Internal server error",
          detail: error.message,
        });
      }
    }
  }
);
