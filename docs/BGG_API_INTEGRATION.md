# BGG API Integration

## Overview

BoardBrawl integrates with the BoardGameGeek (BGG) API to automatically enrich game data with:
- **Images**: Thumbnails and full-size images for all games
- **Metadata**: Designers, publishers, categories, mechanics
- **Ratings**: Average and Geek ratings, rankings
- **Details**: Player counts, playtime, publication year

The integration uses a **cache-first strategy** with intelligent background refresh to provide fast results while respecting BGG's rate limits.

## Key Features

### 1. Smart Game Search
- **Cache-first strategy**: Searches Firestore `/games` collection first
- **Automatic BGG fallback**: Calls BGG API only when cache is insufficient (< 3 results OR any results missing thumbnails)
- **Optimized timing**: 1.5s total delay prevents excessive API calls while typing
- **Seamless UX**: Cache results appear instantly, BGG results append below (no replacement)
- **Progressive loading**: Spinner in dropdown footer shows when BGG search is active

### 2. Background Data Refresh
- **Automatic staleness detection**: Games older than 30 days or missing images
- **Non-blocking updates**: Refreshes happen in background after user selects a game
- **Graceful degradation**: Shows cached data even if refresh fails

### 3. Two Cloud Functions

**`bggSearch`** - Multi-game search (used during typing)
- Endpoint: `https://bggsearch-7lllrlkqcq-uc.a.run.app`
- Input: Query string + limit
- Output: Array of games with full metadata

**`bggThing`** - Single game refresh (used after selection)
- Endpoint: `https://bggthing-7lllrlkqcq-uc.a.run.app`
- Input: BGG game ID
- Output: Complete game data with stats

### 4. CSV Enrichment Script
- **Batch processing**: Enriches existing CSV-imported games
- **Rate-limited**: Respects BGG's 5.5s delay
- **Dry-run support**: Test before committing changes
- **Usage**: `node scripts/enrich-csv-games.js [--limit=N] [--dry-run]`

### 5. BGG API Token
- Configured as Firebase Secret: `BGG_API_TOKEN`
- Accessed securely via `defineSecret()` in cloud functions

## Architecture

### Two BGG Cloud Functions

1. **`bggSearch`** - Multi-game search
   - **Purpose**: Search for games by name
   - **Input**: Query string (e.g., "catan")
   - **Output**: Array of matching games (up to 8)
   - **BGG API**: `/xmlapi2/search?query=catan&type=boardgame` + `/xmlapi2/thing` (batch)
   - **When Used**: During typing to find games

2. **`bggThing`** - Single game details
   - **Purpose**: Get full details for ONE specific game
   - **Input**: BGG game ID (e.g., "13")
   - **Output**: Complete game data (ratings, designers, mechanics, images)
   - **BGG API**: `/xmlapi2/thing?id=13&stats=1`
   - **When Used**: After selecting a game to refresh its data

### Data Flow: Game Search

```
User types: c → a → t → a → n
  ↓
Wait 300ms (debounce - user finishes typing)
  ↓
[1] Search Firestore Cache
  ├─ Prefix search: WHERE normalized STARTS WITH 'catan'
  ├─ Returns 0-8 cached games
  └─ Display immediately
  ↓
Decision: Do we have 3+ games with thumbnails?
  ├─ YES? → Stop here (cache is good)
  └─ NO? → Continue to BGG API
  ↓
Wait 1200ms more (ensure user is done)
  ↓
Check: Has user typed more?
  ├─ YES? → Cancel this BGG call, restart from [1]
  └─ NO? → Continue
  ↓
[2] Call bggSearch (Multi-game)
  ├─ Show loading spinner in dropdown footer
  ├─ Cloud function calls BGG API
  ├─ Returns fresh games with images
  ├─ Saves to Firestore (per-game error handling)
  ├─ **Append** new results to bottom of dropdown (no replacement)
  └─ Hide loading spinner
  ↓
User clicks on a game
  ↓
Return selected game immediately (optimistic)
  ↓
[3] Background Check: Is game stale?
  ├─ Age > 30 days? OR
  ├─ Missing images? OR
  └─ CSV-only data?
  ↓
If YES:
  ├─ Call bggThing (Single game)
  ├─ Fetch fresh ratings/images
  └─ Update Firestore silently
  ↓
Next search will have fresh data
```

### UI/UX Details

**Dropdown Structure:**
- **Scrollable results area**: Game options scroll independently
- **Sticky footer**: "Powered by BGG" always visible at bottom
- **Loading indicator**: Spinner appears in footer when BGG search is active
- **Progressive results**: Cache results shown first, BGG results append below

**Result Appending Logic:**
- Cache results display immediately (no waiting)
- BGG results added to bottom after 1.2s delay
- Duplicates filtered by BGG ID
- No sorting/reordering - maintains user's visual context
- Up to 8 cache results + up to 8 BGG results = max 16 visible

### Timing & Rate Limiting

**Client-Side Timing:**
- **Cache debounce**: 300ms after typing stops
- **Remote delay**: +1200ms before calling BGG
- **Total delay**: 1500ms from last keystroke to BGG call
- **Cooldown**: 2000ms minimum between BGG calls
- **Aggressive cancellation**: Pending remote searches cancelled when user types

**Server-Side Rate Limiting:**
- **BGG API limit**: ~5.5 seconds between requests (BGG guidance)
- **Cloud function enforcement**: Global rate limiter shared across all requests
- **Background refresh**: Fire-and-forget, doesn't block user
- **Enrichment script**: 5.5s delay between games

**Why These Timings:**
- Prevents excessive API calls while typing (e.g., "k" → "ke" → "kel" only triggers ONE call)
- Respects BGG's rate limit with buffer
- Optimistic UI keeps experience fast

## Game Data Model

### Fields Provided by BGG API

| Field | Description | Example |
|-------|-------------|---------|
| `primaryName` | Official game title | "Catan" |
| `altNames` | Alternative titles | ["Settlers of Catan"] |
| `year` | Publication year | 1995 |
| `minPlayers` | Minimum players | 3 |
| `maxPlayers` | Maximum players | 4 |
| `minPlaytime` | Min playtime (minutes) | 60 |
| `maxPlaytime` | Max playtime (minutes) | 120 |
| `playingTime` | Average playtime | 90 |
| `designers` | Game designers | ["Klaus Teuber"] |
| `publishers` | Publishers | ["KOSMOS"] |
| `categories` | Game categories | ["Negotiation", "Trading"] |
| `mechanics` | Game mechanics | ["Dice Rolling", "Trading"] |
| `image` | Full-size image URL | "https://cf.geekdo-images.com/..." |
| `thumbnail` | Thumbnail URL | "https://cf.geekdo-images.com/...__thumb/..." |
| `rating` | Average rating | 7.2 |
| `bayesAverage` | Geek rating | 6.8 |
| `ranks` | Rankings | [{id: "1", name: "boardgame", value: "154"}] |
| `sourceIds.bgg` | BGG ID | "13" |

### Staleness Detection

A game is considered stale if:
1. `fetchedAt` is > 30 days old, OR
2. Missing `image` and `thumbnail`, OR
3. Only has `sources: ['bgg-csv']` (no API data)

## Image Handling

### Image URLs

- BGG serves images from `cf.geekdo-images.com` (CloudFlare CDN)
- URLs are publicly accessible without authentication
- Two sizes available:
  - `thumbnail`: Smaller, optimized for lists
  - `image`: Full-size, suitable for detail views

### No Storage Required

- Images are served directly from BGG's CDN
- No need to copy/store images ourselves
- Fast and reliable delivery
- Reduces storage costs

## Testing

### Manual Testing Performed

1. ✅ Game search in tournament creation (bracket format)
2. ✅ Cache-first search returns results quickly
3. ✅ Game selection triggers optimistic response
4. ✅ Background refresh attempts to fetch fresh data
5. ✅ Dropdown shows game thumbnails (when available)
6. ✅ Cloud functions deployed successfully
7. ✅ BGG API token configured as secret

### Verification

- ✅ Search results display correctly with thumbnails
- ✅ Background refresh executes after game selection
- ✅ Graceful error handling when API unavailable

## Known Issues & Limitations

### Intermittent Permission Errors
- **Issue**: Rarely, some games fail to save to Firestore with "Missing or insufficient permissions"
- **Impact**: Minimal - successful games still save and display, failed games use cache
- **Mitigation**: Per-game error handling allows partial batch success
- **Status**: Under investigation

### BGG Rate Limit
- **Limit**: ~1 request per 5.5 seconds (BGG guidance)
- **Mitigation**: Client-side throttling (2s min between calls) + server-side rate limiter (5.5s)
- **Impact**: Minimal - searches are throttled transparently

## Cached Metadata Enrichment

When games are added to libraries or tournaments, metadata (name, thumbnail, year) is cached as snapshots for fast display. If a game is added without a thumbnail, it's automatically enriched when the data is next loaded.

**How It Works:**

1. **On Library Load** (`loadLibrariesRemote` in `src/services/librarySync.ts`):
   - Library items are fetched from Firestore
   - For each item missing a thumbnail (but has a `gameId`):
     - Looks up the canonical game record in `/games/{gameId}`
     - If the canonical record has a thumbnail, enriches the item immediately
     - Displays enriched data to the user (no waiting)
     - Updates Firestore in background (fire-and-forget) for future loads

2. **On Game Selection** (`selectSuggestion` in `src/components/ui/game-input.tsx`):
   - When user selects a game from search dropdown
   - If game is stale (> 30 days old or missing data):
     - Triggers `refreshGameIfStale()` in background
     - Fetches fresh data from BGG API via `bggThing` cloud function
     - Updates canonical `/games/{gameId}` record
     - Next page load will use fresh data

**Edge Case Handling:**

If you add a game to your library and it doesn't have a thumbnail:
- **If `/games/{gameId}` already has the thumbnail**: It appears on next page refresh
- **If `/games/{gameId}` doesn't have the thumbnail yet**: Refresh page after a few seconds for BGG API to fetch it

This simple approach avoids complex real-time sync while ensuring data stays fresh.

**Implementation Files:**
- `src/services/librarySync.ts` - Enrichment on load
- `src/services/gameSearch.ts` - Staleness detection and refresh
- `src/components/ui/game-input.tsx` - Background refresh trigger

## Future Enhancements

- Exponential backoff for failed refreshes
- Request queue for burst traffic
- User-visible refresh status indicator
- Batch optimization for multiple game refreshes
- Manual refresh button in library settings

## API Usage & Compliance

**Current Database:** ~20,000 games from CSV (most missing images/metadata)

**Usage Estimates:**
- **Initial enrichment**: ~30 hours for 20,000 games (run in batches)
- **Ongoing searches**: ~50-200 calls/day during normal use
- **BGG rate limit**: 10,900 calls/day maximum
- **Compliance**: Well within safe limits ✅

## Implementation Files

**Source Code:**
- `src/components/ui/game-input.tsx` - Search UI with optimistic refresh
- `src/services/gameSearch.ts` - Cache management & BGG API calls
- `functions/src/index.ts` - Cloud functions for BGG API proxy

**Scripts:**
- `scripts/enrich-csv-games.js` - Batch enrichment for existing games

**Rules:**
- `firestore.rules` - Security rules for `/games` collection

## Deployment Commands

```bash
# Build functions
cd functions && npm run build

# Set BGG API token as secret
echo "your-token-here" | firebase functions:secrets:set BGG_API_TOKEN

# Deploy cloud functions
firebase deploy --only functions

# Deploy Firestore rules (if updated)
firebase deploy --only firestore:rules

# Run enrichment script (dry-run first)
export GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"
export BGG_API_TOKEN="your-token"
node scripts/enrich-csv-games.js --limit=10 --dry-run
```

## Verification Checklist

- [x] Remote search enabled in GameInput
- [x] Staleness threshold updated to 30 days
- [x] `bggThing` cloud function deployed
- [x] BGG_API_TOKEN configured as secret
- [x] `refreshGameIfStale` function implemented
- [x] Optimistic refresh on game selection
- [x] Enrichment script created and documented
- [x] Manual testing completed
- [x] Deployment successful

## Debugging & Troubleshooting

### Network Tab Debugging

**Filter Network Calls:**

To see ONLY BGG API calls (and hide Firebase's real-time listeners):
1. Open DevTools → Network tab
2. Filter by: `bggSearch` or `bggThing`
3. To exclude Firestore listeners: `-channel`

**What you'll see:**
- `bggSearch?q=catan&limit=8` - Multi-game searches
- `bggThing?id=13` - Single game refreshes
- **NOT game searches**: `channel?VER=8&database=...` - These are Firebase real-time listeners (normal)

### Check Cloud Function Logs

```bash
firebase functions:log --only bggThing
firebase functions:log --only bggSearch
```

### Test Cloud Functions Directly

```bash
curl "https://bggthing-7lllrlkqcq-uc.a.run.app?id=13"
curl "https://bggsearch-7lllrlkqcq-uc.a.run.app?q=Catan&limit=5"
```

### Monitor API Usage

- Check Firebase Console → Functions → Metrics
- Monitor for 429 (rate limit) errors
- Track average response times

### Common Issues

**Issue: No thumbnails appearing**
- Check Network tab for successful BGG API responses (status 200)
- Verify images are being returned in API response data
- Ensure Firestore rules allow authenticated writes to `/games` collection
- Check browser console for any JavaScript errors

**Issue: Too many BGG calls while typing**
- Expected: ONE `bggSearch` call per completed query in network tab
- If seeing multiple, verify timing constants in `game-input.tsx`

**Issue: Rate limited**
- BGG enforces ~5.5 second rate limit
- Client throttles at 2 seconds minimum between calls
- Check network tab for 429 responses from BGG
- If frequent, consider increasing `REMOTE_COOLDOWN_MS`

## Best Practices

1. **Respect rate limits** - BGG can throttle or block excessive requests
2. **Cache-first strategy** - Minimize unnecessary API calls
3. **Graceful degradation** - Show cached data even if refresh fails
4. **Background processing** - Don't block user interactions
5. **Monitor usage** - Track API call frequency in Firebase Console

---

## Extended Game Data (Box Size, Images, Rules)

The enrichment script (`enrich-csv-games.js`) now fetches additional data beyond basic game information:

### Box Dimensions & Weight

Box dimensions are fetched from BGG's versions API endpoint and stored in **imperial units** (inches and pounds):

- `boxWidthInches`: Box width in inches
- `boxLengthInches`: Box length in inches  
- `boxDepthInches`: Box depth/height in inches
- `boxWeightLbs`: Box weight in pounds

**Converting to metric:**
```javascript
const widthMm = game.boxWidthInches * 25.4;
const lengthMm = game.boxLengthInches * 25.4;
const depthMm = game.boxDepthInches * 25.4;
const weightKg = game.boxWeightLbs * 0.453592;
```

**Note:** Not all games have box dimensions available. The enrichment script uses the first version with dimensions (typically the primary/English version).

### Global vs User Box Dimensions

There are **two separate sets** of box dimension fields in the system:

| Collection | Fields | Units | Source |
|------------|--------|-------|--------|
| `/games/{gameId}` (Global) | `boxWidthInches`, `boxLengthInches`, `boxDepthInches`, `boxWeightLbs` | Imperial (inches/lbs) | BGG API |
| `/users/{uid}/games/{gameId}` (UserGame) | `boxWidthMm`, `boxHeightMm`, `boxDepthMm`, `boxSizeClass` | Metric (mm) + enum | User-editable |

**Design rationale:**
- **Global dimensions** are the "default" from BGG, shared across all users
- **User dimensions** allow users to override for their specific edition/version
- Users can manually enter dimensions if BGG doesn't have them, or if their copy is different

**Usage in UI:**
```typescript
// Prefer user's custom dimensions, fall back to BGG data (converted to mm)
const getBoxDimensionsMm = (userGame: UserGame, globalGame: GameRecord) => {
  if (userGame.boxWidthMm) {
    return {
      width: userGame.boxWidthMm,
      height: userGame.boxHeightMm,
      depth: userGame.boxDepthMm,
    };
  }
  // Fall back to BGG data, converting inches to mm
  if (globalGame.boxWidthInches) {
    return {
      width: Math.round(globalGame.boxWidthInches * 25.4),
      height: Math.round(globalGame.boxLengthInches * 25.4),
      depth: Math.round(globalGame.boxDepthInches * 25.4),
    };
  }
  return null;
};
```

### Additional Images

Beyond the main `image` and `thumbnail` fields, games may have additional gallery images stored in the `additionalImages` field as BGG image IDs:

```javascript
// additionalImages: ["12345", "67890", "11223"]
```

**To construct image URLs:**
```javascript
const imageUrl = `https://boardgamegeek.com/image/${imageId}`;
const thumbnailUrl = `https://cf.geekdo-images.com/thumb/img/${imageId}`;
```

**Usage example:**
```typescript
function GameGallery({ game }: { game: GameRecord }) {
  const allImages = [
    game.image,
    ...(game.additionalImages?.map(id => `https://boardgamegeek.com/image/${id}`) || [])
  ].filter(Boolean);
  
  return (
    <div className="grid grid-cols-3 gap-2">
      {allImages.map((url, i) => (
        <img key={i} src={url} alt={`${game.primaryName} ${i + 1}`} />
      ))}
    </div>
  );
}
```

### Rules Files

Some games include links to rules PDFs stored in the `rulesFiles` field:

```javascript
// rulesFiles: [
//   { id: "12345", name: "English Rules" },
//   { id: "67890", name: "Quick Reference" }
// ]
```

**To construct file URLs:**
```javascript
const fileUrl = `https://boardgamegeek.com/filepage/${fileId}`;
// or direct link if available:
const directUrl = `https://boardgamegeek.com/file/${fileId}`;
```

**Usage example:**
```typescript
function RulesLinks({ game }: { game: GameRecord }) {
  if (!game.rulesFiles?.length) return null;
  
  return (
    <div>
      <h3>Rules & Files:</h3>
      <ul>
        {game.rulesFiles.map(file => (
          <li key={file.id}>
            <a 
              href={`https://boardgamegeek.com/filepage/${file.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {file.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Important:** 
- Rules files are not consistently available for all games
- File links point to BGG file pages, not direct PDF downloads
- Some files may require BGG account/login to access

---

**Last Updated:** January 9, 2026  
**Status:** ✅ Production Ready with Extended Data
