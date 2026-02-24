# Architecture

This document covers the technical architecture, file structure, and data flow patterns in BoardBrawl.

## Project Structure

```
boardbrawl/
├── docs/                    # Documentation
├── functions/               # Firebase Cloud Functions
│   └── src/
│       └── index.ts        # BGG API proxy functions
├── public/                  # Static assets
│   ├── favicon.svg
│   ├── manifest.json       # PWA manifest
│   └── ...
├── scripts/                 # Utility scripts
│   ├── enrich-csv-games.js # BGG data enrichment
│   └── ...
├── src/
│   ├── components/         # React components
│   │   ├── library/        # Library feature components
│   │   └── ui/             # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # External library setup
│   ├── pages/              # Route page components
│   ├── services/           # Business logic & API calls
│   ├── store/              # Zustand state management
│   ├── types/              # TypeScript definitions
│   └── utils/              # Utility functions
├── tests/                   # Integration tests
├── firestore.rules         # Firestore security rules
└── firebase.json           # Firebase configuration
```

## Key Files by Feature

### Tournament System

| File | Purpose |
| --- | --- |
| `src/types/tournament.ts` | TypeScript definitions for `Tournament`, `BracketMatch`, `BracketConfig`, `TournamentFormat` |
| `src/store/tournamentStore.ts` | State management with `updateBracketMatch()`, `regenerateBracket()` |
| `src/pages/NewTournament.tsx` | Tournament creation wizard with format selector and validation |
| `src/pages/TournamentDashboard.tsx` | Main dashboard with bracket view and match result handling |
| `src/components/BracketView.tsx` | Visual bracket display (mobile dropdown + desktop columns) |
| `src/components/MatchResultModal.tsx` | Modal for recording/editing match winners |
| `src/utils/bracketGenerator.ts` | Bracket generation, winner recording, standings calculation |

### Player Sharing

| File | Purpose |
| --- | --- |
| `src/services/firestoreSync.ts` | User code generation, lookup, profile management, `updateUserDisplayName()` |
| `src/store/authStore.ts` | Stores `userProfile.userCode` and `userProfile.displayName` in client state |
| `src/hooks/useAuthSync.ts` | Syncs user profile on login, preserves custom display names |
| `src/hooks/useOwnerProfile.ts` | Fetches owner's current display name dynamically for "Hosted by" |
| `src/components/ui/player-input.tsx` | Input with `#code` detection, user lookup, duplicate prevention |
| `src/components/AuthMenu.tsx` | Displays user's code and name, opens Account Settings |
| `src/components/AccountSettingsModal.tsx` | Modal for setting custom display name and viewing user code |
| `src/components/SharedTournamentCard.tsx` | Tournament card with dynamic owner name for "Shared with You" |

### Board Game Library

| File | Purpose |
| --- | --- |
| `src/types/library.ts` | TypeScript definitions for `Library`, `UserGame`, `ShelfConfig`, etc. |
| `src/store/libraryStore.ts` | Zustand state management with shelf actions and localStorage persistence |
| `src/services/librarySync.ts` | Firestore sync service for libraries, items, and shelves (with debounce) |
| `src/hooks/useLibrarySync.ts` | React hook for automatic Firestore sync |
| `src/pages/Library.tsx` | Individual library view/edit page with List/Shelf toggle |
| `src/pages/PublicLibrary.tsx` | Public read-only library view |
| `src/components/library/AddGameModal.tsx` | Modal for searching and adding games via BGG |
| `src/components/library/EditItemModal.tsx` | Modal for editing game metadata |
| `src/components/library/LibraryItemCard.tsx` | Game card with rating, status, and actions |
| `src/components/library/LibraryFilters.tsx` | Filter, sort, and view mode controls |
| `src/components/library/ShelfView.tsx` | Virtual shelf grid with drag-drop support |
| `src/components/library/ShelfCell.tsx` | Individual shelf cell with games |
| `src/components/library/UnplacedGamesPanel.tsx` | Unplaced games pool with drag-drop |
| `src/services/gameSearch.ts` | BGG API integration for game search |

## Data Flow Patterns

### State Management

BoardBrawl uses **Zustand** for state management with localStorage persistence:

```
User Action → Zustand Store → UI Update
                    ↓
              localStorage (persist)
                    ↓
         Firestore (if signed in)
```

### Sync Strategy

**Local-First Architecture:**
1. All changes are applied to Zustand store immediately (optimistic)
2. Store persists to localStorage for offline support
3. If user is signed in, changes sync to Firestore
4. On load, signed-in users fetch from Firestore, guests use localStorage

### Player Linking Flow

```
1. User signs up/in
   → upsertUserProfile() generates 6-digit code
   → Stored in Firestore

2. User sets display name (optional)
   → updateUserDisplayName()
   → Stored separately, never overwritten

3. User shares their code
   → Friend types #code in PlayerInput
   → lookupUserByCode() finds user

4. Friend confirms link
   → Player added with userId
   → userId added to tournament.memberIds

5. Linked user signs in
   → loadRemoteState() queries by memberIds
   → Tournament appears in "Shared with You"

6. "Hosted by" text
   → useOwnerProfile() dynamically fetches owner's current display name
```

### Bracket Tournament Flow

**Generation:**
```
Players added → validatePlayerCount (4, 8, 16, or 32)
                    ↓
              generateBracket()
                    ↓
              Create matches array
              (sequential seeding: [P1 vs P2, P3 vs P4, ...])
```

**Match Advancement:**
```
Match completed → recordWinner()
                      ↓
              Update current match
                      ↓
              Find feedsIntoMatchId
                      ↓
              Place winner in next round
```

### BGG Integration Flow

```
User types game name
        ↓
  Wait 300ms (debounce)
        ↓
  Search Firestore cache (prefix search)
        ↓
  Display cached results immediately
        ↓
  If < 3 results with thumbnails:
        ↓
  Wait 1200ms more
        ↓
  Call bggSearch cloud function
        ↓
  Append BGG results to dropdown
        ↓
  User selects game
        ↓
  If game is stale (> 30 days):
        ↓
  Background refresh via bggThing
```

See [BGG API Integration](BGG_API_INTEGRATION.md) for detailed documentation.

## Role System

Tournaments have three role types stored in `memberRoles`:

| Role | Permissions |
| --- | --- |
| `owner` | Full control. Can edit everything, delete tournament. |
| `editor` | Can add games and players. (Not currently assignable via UI) |
| `viewer` | Read-only access. Default for linked players. |

The `canEdit` check in `TournamentDashboard.tsx` gates all editing UI.

## Key Implementation Notes

### Bracket Generation Algorithm

```typescript
// Simple power-of-2 bracket generation
// 4 players = 2 matches in Round 1, 1 match in Finals
// 8 players = 4 matches in Round 1, 2 in Round 2, 1 in Finals
// Players are seeded sequentially: [P1 vs P2, P3 vs P4, ...]
```

- `hasStarted` tracks if any matches are complete (used for UI warnings)
- `currentRound` tracks progression for UI highlighting
- Adding/removing players resets `hasStarted` to `false`

### Match Linking

- Each pair of Round N matches feeds into one Round N+1 match
- `feedsIntoMatchId` determines advancement path
- Winner validation ensures winner is one of the two participants

### Shelf State Management

- Shelf configuration stored per-library
- Drag-drop changes debounced (500ms) before Firestore sync
- Unplaced games = games in library but not in any shelf cell
- Maximum 25 rows per shelf

### ID Generation

All IDs are generated via `crypto.randomUUID()` to:
- Avoid collisions
- Prevent predictable identifiers
- Work offline (no server round-trip)
