# Development Roadmap

This document outlines planned features and future development phases for BoardBrawl.

## Improvements

- Full bracket-session `GameSession` integration  - create draft sessions at bracket generation


## Advanced Features

### Planned Features (prioritize based on user feedback)

1. **Auto-Layout Algorithm:** Bin-packing to auto-arrange games on shelf
2. **Advanced Filters:** Player count, playtime, categories
3. **Tags & Categories:** Custom tags, BGG categories/mechanics
4. **Multi-Select & Bulk Actions:** Checkbox mode, bulk move/delete
5. **Statistics & Insights:** Collection stats dashboard with charts

---

## Social & Community Features

1. **Library Comments:** Public library viewers can leave comments
2. **Follow System:** Follow other users, activity feed
3. **Trade/Sell Marketplace:** Mark games for trade/sale, matchmaking
4. **Collection Challenges:** "10x10 challenge" badges
5. **Collection Comparison:** Compare libraries with friends

---

## BGG Collection Import (Optional Quick Win)

**Goal:** Allow users to import their existing BGG collection via CSV export (no BGG API auth required).

### Implementation Steps

1. **Add CSV Import Button:**
   - In library view, add "Import from BGG" button
   - Opens modal with instructions: "Go to BGG → My Geek → Collection → Export as CSV"
   - File input accepts `.csv` files

2. **Parse CSV:**
   - Use `papaparse` library: `npm install papaparse @types/papaparse`
   - Expected CSV columns: `objectid`, `objectname`, `own`, `fortrade`, `want`, `wanttoplay`, `preordered`, `prevowned`, `numplays`, `rating`
   - Filter rows where `own == 1` (owned games)

3. **Batch Import:**
   - For each row, extract BGG ID (`objectid`)
   - Check if game exists in `/games/{gameId}` with `sourceIds.bgg == objectid`
   - If not, fetch game data from `fetchGameByBGGId()` in `gameSearch.ts`
   - Create `UserGame` + add membership in **My Library**
   - If user has `want==1`, add membership in **Wishlist**

4. **Import Feedback:**
   - Show progress bar: "Importing 23/150 games..."
   - Display summary: "Successfully imported 145 games. 5 games could not be found."
   - Allow users to manually search for failed imports

### Key Files to Modify

- `src/pages/Library.tsx` - Add import button
- `src/components/ImportBGGModal.tsx` - New modal component
- `src/services/gameSearch.ts` - Add `batchImportByBGGIds()` helper

### Resources

- [PapaParse Documentation](https://www.papaparse.com/docs)
- [BGG Collection CSV Export](https://boardgamegeek.com/collection/user/USERNAME?exportcsv=1) (replace USERNAME)

---

## AI Photo Import (Shelfie Scanner)

**Goal:** Let users upload a photo of their board game shelf and automatically import detected games into their virtual library.

**Marketing hook:** "Upload your shelfie, get your collection imported instantly"

### User Flow

1. User clicks "Import from Photo" in library view
2. Uploads or takes photo of their board game shelf
3. Photo sent to Gemini Vision (base64, no storage needed)
4. AI returns list of detected game names with confidence scores
5. Each name matched to local games cache or BGG search
6. User sees preview of detected games sorted by confidence
7. User confirms/removes games, selects target library
8. Games added to library and auto-placed on shelf (30cm cell logic)

### Implementation

**Cloud Function - Gemini Vision:**
- `functions/src/geminiVision.ts` - `processShelfPhoto` Cloud Function
- Uses Gemini 2.0 Flash for game spine detection
- Accepts base64 image, returns detected game names with confidence scores
- Secret: `GEMINI_API_KEY` stored in Firebase secrets

**Game Matching:**
- `src/services/gameSearch.ts` - `matchDetectedGames()` function
- Matches detected names to cached games or BGG search
- Uses Levenshtein distance for string similarity
- Handles rate limiting with queued requests

**Client Service:**
- `src/services/photoImport.ts` - Client-side orchestration
- Image compression (max 1920px, ~1MB)
- Progress callbacks during processing

**UI Component:**
- `src/components/library/PhotoImportModal.tsx`
- Photo upload/capture with preview
- Progress indicator during processing
- Review detected games before adding (sorted by confidence)
- Library selector for target destination

**Auto-Placement:**
- `src/store/libraryStore.ts` - `batchAddGamesToShelf()` function
- Adds games to shelf cells using 30cm depth constraint
- Sorts games by depth (thinnest first for efficient packing)
- Adds new rows as needed (up to max 25)
- Overflow goes to Unplaced section

### Firebase Setup Required

1. Enable Vertex AI API in Google Cloud Console
2. Set the Gemini API key secret:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```
3. Deploy the function:
   ```bash
   firebase deploy --only functions
   ```

### Key Files

| File | Purpose |
|------|---------|
| `functions/src/geminiVision.ts` | Gemini Vision Cloud Function |
| `functions/src/index.ts` | Exports `processShelfPhoto` function |
| `src/services/photoImport.ts` | Client-side orchestration |
| `src/services/gameSearch.ts` | `matchDetectedGames()` function |
| `src/components/library/PhotoImportModal.tsx` | UI component |
| `src/store/libraryStore.ts` | `batchAddGamesToShelf()` function |
| `src/pages/Library.tsx` | "Import from Photo" button integration |

---

## Technical Resources

### Libraries & Tools

- **Drag & Drop:** [@hello-pangea/dnd](https://github.com/hello-pangea/dnd) (installed), [dnd-kit](https://dndkit.com/) (alternative)
- **CSV Parsing:** [PapaParse](https://www.papaparse.com/)
- **Bin Packing:** [potpack](https://github.com/mapbox/potpack), [maxrects-packer](https://github.com/soimy/maxrects-packer)
- **Charts:** [recharts](https://recharts.org/), [Chart.js](https://www.chartjs.org/)
- **3D Rendering:** [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- **Image Compression:** [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression)

### BGG API & Data

- **BGG XML API2 Docs:** [BGG API Wiki](https://boardgamegeek.com/wiki/page/BGG_XML_API2)
- **BGG CSV Export:** `https://boardgamegeek.com/collection/user/USERNAME?exportcsv=1`
- **Rate Limiting:** 1 req/sec recommended

### Design Inspiration

- [Google Images: "board game collection kallax"](https://www.google.com/search?tbm=isch&q=board+game+collection+kallax)
- [Reddit: r/boardgames collection posts](https://www.reddit.com/r/boardgames/search?q=collection&restrict_sr=1)

### Layout Algorithms

- [CSS Grid Guide](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [2D Bin Packing Visualization](https://codyebberson.github.io/bin-packing/)
- [Masonry.js](https://masonry.desandro.com/)

### Firestore Best Practices

- **Subcollections vs Root:** Use subcollections for 1-to-many (library → items)
- **Batched Writes:** Use `writeBatch()` for multiple writes (max 500 per batch)
- **Pagination:** Implement with `limit()` and `startAfter()` for large collections

---

## Design Decisions

1. **Multiple Libraries with Default:** Users can have multiple libraries with two default ones that cannot be renamed or deleted
2. **Subcollection Structure:** Library items as Firestore subcollections for grouping and simple queries
3. **Dual Sync Strategy:** Local-first with Zustand + localStorage, syncing to Firestore for signed-in users
4. **Cached Game Metadata:** `LibraryItem` includes cached fields to avoid lookups during rendering
5. **Status Over Quantity:** Focus on ownership status rather than complex purchase tracking
6. **Inline Editing UX:** Edit in-place rather than opening settings modals
7. **Filter-First Design:** Prominent filters for users with large collections
8. **Shareable URLs:** Each library has its own URL that can be shared

---

## Performance Optimization Tips

- **Lazy Loading:** Virtualize library items for large collections (100+ games)
- **Image Optimization:** Use BGG thumbnails for list view, full images for detail view
- **Debouncing:** Debounce search input and shelf updates
- **Caching:** Cache in memory
- **Indexing:** Ensure Firestore indexes exist for queries
