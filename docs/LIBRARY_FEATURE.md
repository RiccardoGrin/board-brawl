# Board Game Library Feature

BoardBrawl includes a virtual board game library feature where users can catalog their physical collection and display it in a virtual shelf view.

## Overview

The library feature allows you to:
- Catalog your board game collection with BGG (BoardGameGeek) integration
- Track ownership status, ratings, play counts, and personal notes
- Display games in a virtual shelf view that mimics real board game shelves
- Create multiple libraries (e.g., "Home Collection", "Office Games")
- Share public libraries with friends

## Current Features

### Library Management

- **Multiple Libraries:** Create and manage multiple libraries per user
- **System Libraries:** "My Library" and "Wishlist" are automatically created (cannot be deleted/renamed)
- **Custom Libraries:** Create additional libraries with custom names
- **Privacy Controls:** Set each library as public or private
- **Library List:** View all libraries at `/library` with "New Library" button
- **Empty States:** Helpful guidance when no games exist in a library

### Game Collection

- **BGG Integration:** Search for games using BoardGameGeek ([details](BGG_API_INTEGRATION.md))
- **Status Tracking:** Mark games as owned, wishlist, preordered, formerly owned, or played
- **Personal Ratings:** Rate games 0-10 with visual star display
- **Custom Notes:** Add personal notes and tags for each game
- **Play Counts:** Manual play count tracking
- **Favorites:** Mark games as favorites for quick filtering
- **Trade/Sale Flags:** Mark games as available for trade or sale

### Game Metadata

| Field | Description |
| --- | --- |
| Game name | From BGG or manually entered |
| Year | Publication year |
| Thumbnail | Game box image from BGG |
| Rating | Your personal 0-10 rating |
| Status | Owned, wishlist, preordered, etc. |
| Trade/Sale | Visual indicators if available |
| Condition | New, like new, good, fair, worn |
| Language | Game language edition |
| Edition | Specific edition (e.g., "2nd Edition") |
| Box Size | S, M, L, XL, or Tall |

### Filters & Sorting

**Quick Filters:**
- Favorites only
- Unplayed games
- For Trade
- For Sale

**Search:**
- Search games by name within a library

**Sort Options:**
- Name (A-Z, Z-A)
- Rating (high to low, low to high)
- Play Count
- Date Added
- Last Played

### Responsive Design

- **Desktop:** Full filter bar with inline controls
- **Mobile:** Collapsible filter panel, optimized touch targets
- **Keyboard Navigation:** Full keyboard accessibility
- **Screen Readers:** ARIA labels and proper semantic markup

---

## Virtual Shelf View

The shelf view displays your games in a customizable 2D grid that resembles real board game shelves (like Kallax units).

### Shelf Layout

**Desktop:**
- 4-column grid
- Drag-and-drop games between cells
- Add/remove rows (up to 25 rows)
- Unplaced games panel on the side

**Mobile:**
- 2-column read-only grid
- Drag-drop disabled (desktop only)
- Tap to view game details

### View Toggle

Switch between List View and Shelf View per library:
- Toggle button in library header
- Preference persists per library
- Shelf auto-creates on first toggle to Shelf view

### Drag & Drop

- Drag games from unplaced panel to shelf cells
- Drag games between shelf cells
- Drag games back to unplaced panel
- Reorder games within a cell
- Changes sync to Firestore with 500ms debounce

### Row Management

- **Add Row:** Add 4 new cells at a time (maximum 25 rows)
- **Remove Row:** Last row removed, games move to unplaced panel

### Visual Design

- Warm wood shelf aesthetic
- Empty cells show "Drag games here" placeholder
- Unplaced games panel shows count indicator
- Game thumbnails displayed in cells

---

## Routes & URLs

| Route | Description |
| --- | --- |
| `/library` | List of user's libraries (shows all libraries with create/manage options) |
| `/library/:libraryId` | View/edit a specific library (owner only) |
| `/u/:usercode/library/:libraryId` | Public library view (if set to public) |

### Shareable Links

- One-click copy of public library share links
- Public libraries are read-only for non-owners
- Signed-in users see their library at `/library/:libraryId`
- Share link format: `/u/:usercode/library/:libraryId`

---

## Key Features

- **BGG Integration:** Search games by name, auto-fetch metadata (image, year, thumbnails)
- **Flexible Status Tracking:** Mark games as owned, wishlist, preordered, formerly owned, or played
- **Personal Ratings:** Rate games 0-10 with visual star display
- **Quick Filters:** One-click filters for favorites, unplayed, trade, and sale items
- **Powerful Sorting:** Sort by name, rating, play count, date added, or last played
- **Inline Editing:** Click-to-edit library name and description without opening modals
- **Share Links:** One-click copy of public library share links (for signed-in users)
- **Multiple Libraries:** Create and manage multiple libraries with default library support
- **Responsive Design:** Mobile-first design with optimized layouts for all screen sizes
- **Accessibility:** Full keyboard navigation and screen reader support with ARIA labels

---

## Data Storage

### Guest Mode

- Libraries and items stored in Zustand state with localStorage persistence
- Data stays in browser, works offline
- `ownerId: 'guest'` for guest libraries

### Signed-In Mode

- Real-time sync to Firestore
- `/users/{userId}/libraries/{libraryId}` - Library documents
- `/users/{userId}/libraries/{libraryId}/items/{itemId}` - Library items
- `/games/{gameId}` - Canonical game metadata (shared across users)

### Cached Metadata

Library items cache game metadata for fast display:
- `gameName` - Game title
- `gameThumbnail` - BGG thumbnail URL
- `gameYear` - Publication year

These are enriched automatically when loading libraries if missing.

---

## Security

- **Guest mode:** Data stays in browser (Zustand + localStorage) with `ownerId: 'guest'`
- **Signed-in users:** Data synced to Firestore under `/users/{userId}/libraries/`
- **Firestore rules enforce:**
  - `ownerId` must match authenticated user ID
  - Field validation (name ≤50 chars, description ≤200 chars)
  - Visibility must be 'public' or 'private'
  - Only owners can write/delete their libraries
  - Public libraries are readable by anyone with the link

---

## Known Limitations

- **Manual Play Counts:** Play counts must be updated manually. Automatic tracking via game sessions planned for future.
- **No BGG Collection Import:** CSV import feature planned but not yet implemented.
- **Mobile Shelf Editing:** Shelf drag-drop is desktop-only. Mobile users see read-only shelf view.
- **No Box Dimensions:** All game boxes rendered same size. Dimension-based scaling planned for future.
- **No Collaboration:** Single-user only. Shared libraries planned for future.
- **No Followers:** Follower-only visibility planned for future.

---

## Testing Checklist

### Library Basics
- [x] Access library as guest or signed-in user
- [x] Default library auto-created on first visit
- [x] Create, delete, and manage multiple libraries
- [x] Set library as default
- [x] Add games to library via BGG search
- [x] Edit library name and description inline
- [x] Toggle visibility between public and private
- [x] Copy public share link to clipboard

### Game Management
- [x] Edit game details (rating, notes, condition, etc.)
- [x] Mark games as favorite
- [x] Set games for trade/sale
- [x] Delete games from library
- [x] Empty state displays correctly

### Filters & Sorting
- [x] Filter by favorites, unplayed, trade, sale
- [x] Search games by name
- [x] Sort by name, rating, play count, date added

### Shelf View
- [x] Toggle between List and Shelf view
- [x] Shelf auto-creates on first toggle to Shelf view
- [x] Drag game from unplaced panel to shelf cell
- [x] Drag game between shelf cells
- [x] Drag game from shelf cell back to unplaced panel
- [x] Reorder games within a cell
- [x] Add row (up to 25 rows max)
- [x] Remove row (games move to unplaced)
- [x] Desktop: 4-column grid displays correctly
- [x] Mobile: 2-column read-only grid displays correctly
- [x] Empty cells show "Drag games here" placeholder
- [x] Shelf persists across page refreshes
- [x] Shelf syncs to Firestore (debounced)
- [x] Public libraries show shelf view correctly (read-only)
- [x] View mode preference persists per library

### UI/UX
- [x] Mobile responsive layout works
- [x] Keyboard navigation and ARIA labels functional
- [x] Golden border on default library cards
- [x] Privacy icons display correctly
- [x] localStorage persistence across page refreshes
- [ ] Test with 100+ games (performance check)
