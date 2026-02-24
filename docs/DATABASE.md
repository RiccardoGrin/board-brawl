# Database Schema

This document describes the Firestore collections, data models, and security rules for BoardBrawl.

## Firestore Collections

### Top-Level Collections

| Collection | Description |
| --- | --- |
| `/tournaments/{tournamentId}` | Tournament documents |
| `/gameSessions/{sessionId}` | Game sessions (Phase 3 - top-level for flexibility) |
| `/games/{gameId}` | Canonical game metadata (shared across users, indexed by BGG ID) |
| `/users/{userId}` | User profiles |
| `/users/{userId}/games/{gameId}` | UserGame - canonical per-user game metadata |
| `/users/{userId}/libraries/{libraryId}` | Library documents |
| `/users/{userId}/libraries/{libraryId}/items/{gameId}` | LibraryMembership - links games to libraries |

### Guest Mode

In guest mode, data is stored in Zustand state with localStorage persistence:
- Libraries and items stored locally with `ownerId: 'guest'`
- On first sign-in, local data is uploaded if cloud is empty

## Data Models

### Tournament

```typescript
type Tournament = {
  id: string;
  name: string;              // Max 25 characters
  description?: string;      // Max 60 characters
  ownerId: string;           // User ID of creator
  
  // Format
  format: 'multi-game' | 'bracket';
  gameName?: string;         // Required for bracket tournaments (max 80 chars)
  
  // Players
  players: Player[];         // Max 100 players
  memberIds: string[];       // User IDs with access
  memberRoles: Record<string, 'owner' | 'editor' | 'viewer'>;
  
  // Multi-game specific
  sessions?: GameSession[];  // Max 500 sessions
  
  // Bracket specific
  bracketConfig?: BracketConfig;
  
  // State
  finished: boolean;
  hasStarted: boolean;
  currentRound?: number;
  
  createdAt: string;         // ISO string
  updatedAt: string;         // ISO string
};

type Player = {
  id: string;
  name: string;              // Max 20 characters
  color: string;             // Hex color
  userId?: string;           // If linked to registered user
};

type BracketConfig = {
  rounds: number;
  matches: BracketMatch[];
};

type BracketMatch = {
  id: string;
  round: number;
  matchIndex: number;
  
  player1Id?: string;        // Player ID
  player2Id?: string;        // Player ID
  winnerId?: string;         // Player ID of winner
  
  feedsIntoMatchId?: string; // Next match in bracket
  feedPosition?: 1 | 2;      // Position in next match
};
```

### Game Session (Phase 3 Top-Level Collection)

Game sessions are now stored as top-level documents in `/gameSessions/{sessionId}` for flexibility. Sessions can be linked to tournaments, bracket matches, or be standalone casual sessions.

```typescript
type GameSession = {
  id: string;
  ownerId: string;           // Firebase UID of session creator
  createdAt: string;
  updatedAt: string;
  playedAt: string;          // When the game was played

  // Game info
  gameId?: string;           // References /games/{gameId}
  gameName: string;          // Max 80 characters
  gameThumbnail?: string;    // Thumbnail URL (cached)
  gameSourceIds?: { bgg?: string };
  gameMeta?: GameMeta;       // Full metadata snapshot

  // Linking (all optional for casual sessions)
  tournamentId?: string;     // References /tournaments/{tournamentId}
  bracketMatchId?: string;   // For bracket tournament matches

  // Lifecycle
  status: 'draft' | 'complete';

  // Scoring
  preset: 'quick' | 'medium' | 'big' | 'bracket';
  scoringRules: ScoringRules;  // Snapshot of rules used

  // Participant tracking (for Firestore rules and queries)
  participantUserIds: string[];  // Firebase UIDs of all participants
  winnerUserIds: string[];       // Firebase UIDs of winners

  // Participants with enriched data
  participants: Array<{
    playerId: string;        // References Tournament.players[].id or local ID
    userId?: string;         // Firebase UID if linked
    name: string;            // Snapshot of player name
    teamId?: string;         // For team games
  }>;

  // Teams (optional, for team games)
  teams?: TeamComposition[];

  // Results
  results: {
    mode: 'freeForAll' | 'teams';
    placements: Array<{
      rank: number;
      playerIds: string[];   // Players at this rank
      points?: number;
    }>;
  };

  // Optional enrichment (signed-in users only)
  note?: string;             // Personal note (max 1000 chars)
  media?: Array<{            // Photos attached to session
    id: string;
    type: 'image';
    storagePath: string;     // Firebase Storage path
    width?: number;
    height?: number;
    createdAt: string;
  }>;
};

type ScoringRules = {
  first: number;
  second: number;
  third: number;
  others: number;
};
```

### User Profile

```typescript
type User = {
  uid: string;
  userCode: string;          // 6-digit code (e.g., "847291")
  displayName?: string;      // Custom display name (1-25 chars)
  email?: string;            // From auth provider
  createdAt: string;
  updatedAt: string;
};
```

### Library

```typescript
type Library = {
  id: string;
  ownerId: string;           // User ID of owner (required for security)
  name: string;              // Max 50 characters
  description?: string;      // Max 200 characters
  visibility: 'public' | 'private';  // 'followers' planned for future
  systemKey?: 'my' | 'wishlist';     // System libraries cannot be renamed/deleted
  sortOrder?: number;        // For custom ordering
  viewMode?: 'list' | 'shelf';       // User's preferred view mode

  // Shelf theming
  theme?: {
    frameColor?: string;
    backingColor?: string;
  };

  createdAt: string;         // ISO string
  updatedAt: string;         // ISO string
};
```

### UserGame (Canonical Per-User Game Metadata)

Single source of truth for a user's relationship with a game. The same game can appear in multiple libraries, but metadata lives here.

```typescript
type UserGame = {
  gameId: string;            // References /games/{gameId}
  ownerId: string;           // User ID

  // Cached game data (avoids joins)
  gameName: string;
  gameThumbnail?: string;
  gameYear?: number;

  // User metadata
  status: 'owned' | 'preordered' | 'formerlyOwned' | 'played';  // Wishlist is a system library, not a status
  myRating?: number;         // 0-10 scale
  favorite: boolean;
  notes?: string;
  tags?: string[];

  // Trade/Sale
  forTrade: boolean;
  forSale: boolean;

  // Physical attributes
  boxSizeClass?: 'S' | 'M' | 'L' | 'XL' | 'Tall';
  boxWidthMm?: number;
  boxHeightMm?: number;
  boxDepthMm?: number;
  condition?: 'new' | 'likeNew' | 'good' | 'fair' | 'worn';
  language?: string;
  edition?: string;

  // Play tracking (future: derived from game sessions)
  playCount?: number;
  winCount?: number;

  createdAt: string;
  updatedAt: string;
};
```

### LibraryMembership

Lightweight reference linking a game to a library. Actual game metadata lives in UserGame.

```typescript
type LibraryMembership = {
  gameId: string;            // References /games/{gameId} and /users/{uid}/games/{gameId}
  addedAt: string;           // ISO string
  hideFromPublic?: boolean;  // Hide this game when library is public

  // Cached fields for faster list rendering
  gameName?: string;
  gameThumbnail?: string;
  gameYear?: number;
};
```

### Shelf Configuration

Stored at `/users/{uid}/libraries/{libraryId}/shelves/default` (single document per library).

```typescript
type ShelfConfig = {
  rowCount: number;          // 1-25 rows
  cells: ShelfCell[];        // Array of cells, length = rowCount * 4
  createdAt: string;
  updatedAt: string;
};

type ShelfCell = {
  gameIds: string[];         // Ordered array of game IDs
  orientation: 'vertical' | 'horizontal';
};
```

### Game Record (Canonical)

```typescript
type GameRecord = {
  id: string;                // Firestore document ID
  
  // Core identifiers
  primaryName: string;
  altNames?: string[];
  normalizedName: string;    // For prefix search
  
  // External IDs
  sourceIds: {
    bgg?: string;            // BoardGameGeek ID
  };
  
  // Metadata
  year?: number;
  minPlayers?: number;
  maxPlayers?: number;
  minPlaytime?: number;
  maxPlaytime?: number;
  playingTime?: number;
  
  // Categorization
  designers?: string[];
  publishers?: string[];
  categories?: string[];
  mechanics?: string[];
  
  // Images
  image?: string;            // Full-size URL
  thumbnail?: string;        // Thumbnail URL
  additionalImages?: string[];  // BGG image IDs
  
  // Ratings
  rating?: number;           // Average rating
  bayesAverage?: number;     // Geek rating
  ranks?: Array<{
    id: string;
    name: string;
    value: string;
  }>;
  
  // Box dimensions (from BGG)
  boxWidthInches?: number;
  boxLengthInches?: number;
  boxDepthInches?: number;
  boxWeightLbs?: number;
  
  // Rules
  rulesFiles?: Array<{
    id: string;
    name: string;
  }>;
  
  // Source tracking
  sources?: string[];        // ['bgg', 'bgg-csv', etc.]
  fetchedAt?: string;        // When data was last fetched
  
  createdAt: string;
  updatedAt: string;
};
```

## Security Rules Summary

### Tournaments

```javascript
match /tournaments/{tournamentId} {
  // Read: any signed-in user (planned: tighten to member-only)
  allow read: if request.auth != null;
  
  // Create: signed-in + uid in memberIds + shape validation
  allow create: if request.auth != null 
    && request.auth.uid in request.resource.data.memberIds
    && validTournamentShape();
  
  // Update: owner-only + shape validation
  allow update: if request.auth != null 
    && request.auth.uid == resource.data.ownerId
    && validTournamentShape();
  
  // Delete: owner-only
  allow delete: if request.auth != null 
    && request.auth.uid == resource.data.ownerId;
}
```

### UserGames

```javascript
match /users/{userId}/games/{gameId} {
  // Read/Write: owner only
  allow read, write: if request.auth.uid == userId;
}
```

### Libraries

```javascript
match /users/{userId}/libraries/{libraryId} {
  // Read: owner OR public library with direct link
  allow read: if request.auth.uid == userId
    || resource.data.visibility == 'public';

  // Write: owner only (system libraries cannot be deleted)
  allow write: if request.auth.uid == userId
    && validLibraryShape();

  // Delete: owner only, but not system libraries
  allow delete: if request.auth.uid == userId
    && resource.data.systemKey == null;
}

match /users/{userId}/libraries/{libraryId}/items/{gameId} {
  // Read: owner OR public library (respects hideFromPublic)
  allow read: if request.auth.uid == userId
    || get(/databases/$(database)/documents/users/$(userId)/libraries/$(libraryId)).data.visibility == 'public';

  // Write: owner only
  allow write: if request.auth.uid == userId;
}

match /users/{userId}/libraries/{libraryId}/shelves/{shelfId} {
  // Read: owner OR public library
  allow read: if request.auth.uid == userId
    || get(/databases/$(database)/documents/users/$(userId)/libraries/$(libraryId)).data.visibility == 'public';

  // Write: owner only
  allow write: if request.auth.uid == userId;
}
```

### Users

```javascript
match /users/{userId} {
  // Read: any signed-in user (for player code lookups)
  allow read: if request.auth != null;
  
  // Write: own doc only
  allow write: if request.auth.uid == userId;
}
```

### Game Sessions (Phase 3)

```javascript
match /gameSessions/{sessionId} {
  // Read: owner or participant
  allow read: if request.auth != null
    && (resource.data.ownerId == request.auth.uid
        || request.auth.uid in resource.data.participantUserIds);

  // Create: signed-in, ownerId must match auth
  allow create: if request.auth != null
    && request.resource.data.ownerId == request.auth.uid
    && validSessionShape();

  // Update: owner only
  allow update: if request.auth != null
    && resource.data.ownerId == request.auth.uid
    && validSessionShape();

  // Delete: owner only
  allow delete: if request.auth != null
    && resource.data.ownerId == request.auth.uid;
}
```

### Games (Canonical)

```javascript
match /games/{gameId} {
  // Read: any signed-in user
  allow read: if request.auth != null;

  // Write: any signed-in user (for BGG data caching)
  allow write: if request.auth != null
    && validGameShape();
}
```

## Shape Validation

### String Length Limits

| Field | Max Length |
| --- | --- |
| Tournament name | 25 characters |
| Tournament description | 60 characters |
| Player name | 20 characters |
| Game name | 80 characters |
| Library name | 50 characters |
| Library description | 200 characters |
| Display name | 25 characters |

### List Size Limits

| Field | Max Size |
| --- | --- |
| Tournament players | 100 |
| Tournament sessions | 500 |
| Session participants | 200 |
| Library memberships (soft cap) | 450 |
| Shelf rows | 25 |

> **Note:** The 450 membership limit allows client-side batch delete without recursive delete helpers (450 items + 1 library doc ≤ 500 operations).

## Indexes

Firestore automatically creates single-field indexes. Composite indexes may be required for:
- Querying tournaments by `memberIds` (array-contains) + `createdAt`
- Querying library items by `libraryId` + `status`
- Querying games by `normalizedName` prefix search

Firebase Console will prompt when an index is needed.

## Quota Considerations

### Reads
- Each library view = 1 read (library doc) + N reads (items)
- Cache library doc client-side to reduce reads

### Writes
- Each game add = 1 write (item doc) + 1 write (library updatedAt)
- Use batched writes when possible

### Free Tier Limits
- 50K reads/day
- 20K writes/day
- Monitor usage in Firebase Console
