# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BoardBrawl is a React/TypeScript PWA for managing casual multi-game tournaments. It uses a local-first architecture with optional Firebase sync for authenticated users.

## Commands

```bash
# Development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Run tests (Vitest watch mode)
npm test

# Run Firestore security rules tests (requires Firebase emulator)
npm run test:rules

# Lint
npm run lint

# Preview production build
npm run preview
```

**Deployment (Firebase):**
```bash
firebase deploy              # All services
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## Architecture

### Data Flow
```
User Action → Zustand Store → localStorage → Firestore (if signed in)
```
- Optimistic UI updates (changes apply immediately to local state)
- localStorage provides offline persistence
- Firestore syncs only for authenticated users
- Security enforced via Firestore rules, not client-side

### Key Directories

- `src/store/` - Zustand stores with localStorage persistence
  - `tournamentStore.ts` - Tournament, match, and bracket state
  - `libraryStore.ts` - Board game collection state
  - `authStore.ts` - User auth and profile
- `src/services/` - Business logic and external APIs
  - `firestoreSync.ts` - Firestore read/write operations
  - `gameSearch.ts` - BoardGameGeek API integration
- `src/pages/` - Route components (NewTournament, TournamentDashboard, Library)
- `src/components/ui/` - Reusable UI components
- `src/components/library/` - Library-specific components (ShelfView, AddGameModal)
- `functions/` - Firebase Cloud Functions (BGG API proxy)
- `docs/` - Detailed documentation (see below)

### Documentation

Detailed documentation in `docs/`:
- `ARCHITECTURE.md` - Data flow, state management, key files by feature
- `DATABASE.md` - Firestore schema, security rules, data models
- `DEVELOPMENT.md` - Setup, deployment, Firebase config, troubleshooting
- `TOURNAMENT_FEATURES.md` - Tournament formats, player sharing, scoring
- `LIBRARY_FEATURE.md` - Board game library, shelf view, filters
- `BGG_API_INTEGRATION.md` - BoardGameGeek API, caching, cloud functions
- `ROADMAP.md` - Planned features and future phases

Also see `STYLE_GUIDE.md` in the root for the design system.

### Tournament System
- Two formats: Multi-game (round-robin) and Single-elimination bracket
- Brackets support 4, 8, 16, or 32 players (power-of-2 constraint)
- Match results feed into next round via `feedsIntoMatchId`

### Player Sharing
- Users have 6-digit codes (`#123456`) for linking players across tournaments
- Three permission levels: owner, editor, viewer
- Player codes looked up via Firestore, no email exposure

### Board Game Library
- Two system libraries: "My Library" and "Wishlist" (cannot be deleted/renamed)
- UserGame model: canonical per-user game metadata shared across libraries
- LibraryMembership: lightweight link between games and libraries
- 2D virtual shelf with drag-drop (uses @hello-pangea/dnd)
- BGG API integration for game metadata (cached in Firestore, 30-day expiry)

## Design System

"Modern Medieval" theme defined in `STYLE_GUIDE.md`:
- Colors: Paper (#f4efe5), Ink (#191613), Gold (#b8923b), Green (#2f6b4f)
- Font: Inter with engraved styling for headers
- Button classes: `.btn-medieval-primary` (green), `.btn-medieval` (white)
- Card classes: `.card-medieval`, `.card-medieval-interactive`
- Hover effect: `hover:translate-y-[-2px]` with subtle lift

## Constraints

- Tournament names: max 25 characters
- Descriptions: max 60 characters
- Player names: max 20 characters
- Players per tournament: max 100
- Sessions per tournament: max 500
- Shelf rows: max 25
- Minimum font size: 14px (text-xs)

## Testing

- Unit tests: Vitest + React Testing Library (`npm test`)
- Firestore rules tests: `tests/rules/firestore.rules.test.ts` (`npm run test:rules`)

## Environment Variables

Required in `.env.local` (see `env.example`):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_SITE_URL  # For SEO canonical URLs
```
