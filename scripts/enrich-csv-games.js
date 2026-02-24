/**
 * Enrichment Script for CSV-Only Games
 * 
 * This script identifies games in Firestore that only have CSV data (missing
 * images, thumbnails, and other API fields) and enriches them with data from
 * the BoardGameGeek API.
 * 
 * Usage:
 * 1) Ensure you have a service account key for your Firebase project.
 *    Export GOOGLE_APPLICATION_CREDENTIALS pointing to that JSON:
 *      PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\key.json"
 *      Bash: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
 * 
 * 2) Set your BGG API token:
 *      PowerShell: $env:BGG_API_TOKEN="your-token-here"
 *      Bash: export BGG_API_TOKEN="your-token-here"
 * 
 * 3) Install dependencies if needed:
 *      npm install firebase-admin fast-xml-parser
 * 
 * 4) Run:
 *      node scripts/enrich-csv-games.js [--limit=N] [--dry-run]
 * 
 * Options:
 *   --limit=N    Process only N games (useful for testing)
 *   --dry-run    Show what would be updated without making changes
 * 
 * The script:
 * - Finds games with sources=['bgg-csv'] or missing image/thumbnail
 * - Fetches fresh data from BGG API (respecting 5.5s rate limit)
 * - Updates Firestore with enriched data
 * - Provides progress updates and summary statistics
 */

import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

// Parse command line arguments
const argv = process.argv.slice(2);
const limitArg = argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const dryRun = argv.includes('--dry-run');

// BGG API rate limit (5.5 seconds between requests)
const RATE_LIMIT_MS = 5500;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1200;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('❌ Please set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON.');
  process.exit(1);
}

if (!process.env.BGG_API_TOKEN) {
  console.error('❌ Please set BGG_API_TOKEN environment variable.');
  console.error('   PowerShell: $env:BGG_API_TOKEN="your-token"');
  console.error('   Bash: export BGG_API_TOKEN="your-token"');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const gamesCollection = db.collection('games');
const BGG_API_TOKEN = process.env.BGG_API_TOKEN;

/**
 * Parses BGG XML response to extract game data
 */
function parseBggXml(xmlText) {
  // Use the same parsing logic as the cloud function
  // For simplicity, we'll use a basic XML parser here
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "text",
  });
  return parser.parse(xmlText);
}

/**
 * Converts array-or-single-value to array
 */
function toArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Normalizes game name for indexing
 */
function normalizeName(s) {
  return s.trim().toLowerCase();
}

/**
 * Parses BGG thing data to game record format
 */
function parseThing(thing) {
  const names = toArray(thing.name);
  const primary = names.find((n) => n.type === "primary");
  const alts = names.filter((n) => n.type !== "primary");

  const links = toArray(thing.link);
  const getLinkValues = (type) =>
    links.filter((l) => l.type === type).map((l) => l.value);
  
  // Extract additional image IDs from boardgameimage links
  const imageLinks = links.filter((l) => l.type === "boardgameimage");
  const additionalImageIds = imageLinks.map((l) => l.id).filter(Boolean);
  
  // Extract file links (rules PDFs)
  const fileLinks = links.filter((l) => l.type === "boardgamefile" || l.type === "file");
  const rulesFiles = fileLinks.map((l) => ({
    id: l.id,
    name: l.value,
  })).filter(Boolean);

  return {
    primaryName: primary?.value ?? thing.name?.value ?? "",
    altNames: alts.map((n) => n.value).filter(Boolean),
    sourceIds: { bgg: String(thing.id) },
    year: thing.yearpublished?.value ? Number(thing.yearpublished.value) : undefined,
    minPlayers: thing.minplayers?.value ? Number(thing.minplayers.value) : undefined,
    maxPlayers: thing.maxplayers?.value ? Number(thing.maxplayers.value) : undefined,
    minPlaytime: thing.minplaytime?.value ? Number(thing.minplaytime.value) : undefined,
    maxPlaytime: thing.maxplaytime?.value ? Number(thing.maxplaytime.value) : undefined,
    playingTime: thing.playingtime?.value ? Number(thing.playingtime.value) : undefined,
    designers: getLinkValues("boardgamedesigner"),
    publishers: getLinkValues("boardgamepublisher"),
    categories: getLinkValues("boardgamecategory"),
    mechanics: getLinkValues("boardgamemechanic"),
    image: thing.image ?? undefined,
    thumbnail: thing.thumbnail ?? undefined,
    additionalImages: additionalImageIds.length > 0 ? additionalImageIds : undefined,
    rulesFiles: rulesFiles.length > 0 ? rulesFiles : undefined,
    rating: thing.statistics?.ratings?.average?.value
      ? Number(thing.statistics.ratings.average.value)
      : undefined,
    bayesAverage: thing.statistics?.ratings?.bayesaverage?.value
      ? Number(thing.statistics.ratings.bayesaverage.value)
      : undefined,
    ranks: toArray(thing.statistics?.ratings?.ranks?.rank).map((r) => ({
      id: r.id,
      name: r.name,
      value: r.value,
      bayes: r.bayesaverage,
    })),
    fetchedAt: new Date().toISOString(),
    sources: ["bgg"],
    normalized: primary?.value ? normalizeName(primary.value) : undefined,
  };
}

/**
 * Fetches box dimensions from BGG API versions endpoint
 * Box dimensions are stored in imperial units (inches for dimensions, pounds for weight)
 */
async function fetchBggVersions(bggId, attempt = 1) {
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(bggId)}&versions=1`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://boardgamegeek.com/",
    "Authorization": `Bearer ${BGG_API_TOKEN}`,
  };

  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if ([401, 429, 500, 502, 503].includes(response.status) && attempt < RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        return fetchBggVersions(bggId, attempt + 1);
      }
      // Don't throw - versions are optional
      return null;
    }

    const xmlText = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "text",
    });
    const json = parser.parse(xmlText);
    const items = toArray(json?.items?.item);
    
    if (items.length === 0) return null;
    
    const versions = toArray(items[0]?.versions?.item);
    if (versions.length === 0) return null;
    
    // Get the first version with dimensions (usually the primary/English version)
    for (const version of versions) {
      const width = version.width?.value ? Number(version.width.value) : undefined;
      const length = version.length?.value ? Number(version.length.value) : undefined;
      const depth = version.depth?.value ? Number(version.depth.value) : undefined;
      const weight = version.weight?.value ? Number(version.weight.value) : undefined;
      
      // If this version has any dimensions, use it
      if (width || length || depth || weight) {
        return {
          boxWidthInches: width,
          boxLengthInches: length,
          boxDepthInches: depth,
          boxWeightLbs: weight,
        };
      }
    }
    
    return null;
  } catch (error) {
    // Versions are optional, don't fail the whole enrichment
    console.debug(`Could not fetch versions for BGG ID ${bggId}:`, error.message);
    return null;
  }
}

/**
 * Fetches game data from BGG API with retry logic
 */
async function fetchBggGame(bggId, attempt = 1) {
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(bggId)}&stats=1`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://boardgamegeek.com/",
    "Authorization": `Bearer ${BGG_API_TOKEN}`,
  };

  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if ([401, 429, 500, 502, 503].includes(response.status) && attempt < RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        return fetchBggGame(bggId, attempt + 1);
      }
      throw new Error(`BGG API returned ${response.status}`);
    }

    const xmlText = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "text",
    });
    const json = parser.parse(xmlText);
    const things = toArray(json?.items?.item);

    if (things.length === 0) {
      throw new Error('No game data returned');
    }

    const gameData = parseThing(things[0]);
    
    // Fetch box dimensions from versions endpoint
    const versions = await fetchBggVersions(bggId);
    if (versions) {
      Object.assign(gameData, versions);
    }
    
    return gameData;
  } catch (error) {
    if (attempt < RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      return fetchBggGame(bggId, attempt + 1);
    }
    throw error;
  }
}

/**
 * Merges new BGG data with existing game record
 */
function mergeGameData(existing, bggData) {
  return {
    ...existing,
    ...bggData,
    // Don't include gameId - it's stored as the document ID, not a field
    altNames: Array.from(new Set([...(existing.altNames || []), ...(bggData.altNames || [])])),
    sources: Array.from(new Set([...(existing.sources || []), ...(bggData.sources || [])])),
    sourceIds: { ...existing.sourceIds, ...bggData.sourceIds },
    designers: Array.from(new Set([...(existing.designers || []), ...(bggData.designers || [])])),
    publishers: Array.from(new Set([...(existing.publishers || []), ...(bggData.publishers || [])])),
    categories: Array.from(new Set([...(existing.categories || []), ...(bggData.categories || [])])),
    mechanics: Array.from(new Set([...(existing.mechanics || []), ...(bggData.mechanics || [])])),
    ranks: bggData.ranks ?? existing.ranks ?? [],
    fetchedAt: bggData.fetchedAt,
  };
}

/**
 * Main enrichment function
 */
async function enrichCsvGames() {
  console.log('🔍 Finding games that need enrichment...\n');
  
  // Find games that need enrichment
  let query = gamesCollection;
  
  // Query for games with only CSV sources or missing images
  const snapshot = await query.get();
  
  const gamesToEnrich = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const needsEnrichment = 
      !data.image || 
      !data.thumbnail || 
      (data.sources?.length === 1 && data.sources[0] === 'bgg-csv');
    
    if (needsEnrichment && data.sourceIds?.bgg) {
      gamesToEnrich.push({
        gameId: doc.id,
        bggId: data.sourceIds.bgg,
        name: data.primaryName,
        existingData: data,
      });
    }
  });

  console.log(`📊 Found ${gamesToEnrich.length} games needing enrichment`);
  
  if (limit) {
    console.log(`⚠️  Limiting to ${limit} games (--limit flag)`);
    gamesToEnrich.splice(limit);
  }
  
  if (dryRun) {
    console.log('🔵 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('');
  }

  if (gamesToEnrich.length === 0) {
    console.log('✅ All games are already enriched!');
    return;
  }

  let enriched = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < gamesToEnrich.length; i++) {
    const game = gamesToEnrich[i];
    const progress = `[${i + 1}/${gamesToEnrich.length}]`;
    
    console.log(`${progress} Processing: ${game.name} (BGG ID: ${game.bggId})`);

    try {
      // Fetch fresh data from BGG
      const bggData = await fetchBggGame(game.bggId);
      
      if (!bggData || !bggData.primaryName) {
        console.log(`  ⚠️  No valid data returned, skipping`);
        skipped++;
        continue;
      }

      // Merge with existing data
      const merged = mergeGameData(game.existingData, bggData);

      // Update Firestore
      if (!dryRun) {
        await gamesCollection.doc(game.gameId).set(merged, { merge: true });
        const extras = [];
        if (merged.boxWidthInches) extras.push(`box: ${merged.boxWidthInches}"×${merged.boxLengthInches}"×${merged.boxDepthInches}"`);
        if (merged.additionalImages?.length) extras.push(`${merged.additionalImages.length} images`);
        if (merged.rulesFiles?.length) extras.push(`${merged.rulesFiles.length} rules`);
        console.log(`  ✅ Enriched with image, ${merged.designers?.length || 0} designers, ${merged.mechanics?.length || 0} mechanics${extras.length ? ', ' + extras.join(', ') : ''}`);
      } else {
        const extras = [];
        if (merged.boxWidthInches) extras.push(`box: ${merged.boxWidthInches}"×${merged.boxLengthInches}"×${merged.boxDepthInches}"`);
        if (merged.additionalImages?.length) extras.push(`${merged.additionalImages.length} images`);
        if (merged.rulesFiles?.length) extras.push(`${merged.rulesFiles.length} rules`);
        console.log(`  🔵 Would enrich with image, ${merged.designers?.length || 0} designers, ${merged.mechanics?.length || 0} mechanics${extras.length ? ', ' + extras.join(', ') : ''}`);
      }
      
      enriched++;

      // Rate limiting: Wait 5.5 seconds between requests (unless it's the last one)
      if (i < gamesToEnrich.length - 1) {
        const waitTime = RATE_LIMIT_MS;
        process.stdout.write(`  ⏳ Waiting ${waitTime / 1000}s (rate limit)...`);
        await new Promise((r) => setTimeout(r, waitTime));
        process.stdout.write(' done\n');
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      failed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 Enrichment Summary');
  console.log('='.repeat(60));
  console.log(`✅ Enriched:  ${enriched} games`);
  console.log(`❌ Failed:    ${failed} games`);
  console.log(`⚠️  Skipped:   ${skipped} games`);
  console.log(`⏱️  Duration:  ${duration}s`);
  if (dryRun) {
    console.log(`🔵 DRY RUN - No changes were made to Firestore`);
  }
  console.log('='.repeat(60));
}

// Run the script
enrichCsvGames()
  .then(() => {
    console.log('\n✨ Enrichment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Enrichment failed:', error);
    process.exit(1);
  });

