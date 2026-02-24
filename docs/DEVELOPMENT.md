# Development Guide

This guide covers setup, deployment, and configuration for BoardBrawl.

## Requirements

- **Node.js:** 22.12+ (or ≥20.19)
- **npm:** Included with Node.js

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install --include=dev
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```
   The app runs at `http://localhost:5173` (Vite default). Use `npm run dev -- --host --port 3000` for port 3000.

3. **Build for production:**
   ```bash
   npm run build
   ```
   Runs TypeScript compiler + Vite build.

4. **Run tests:**
   ```bash
   npm test              # Unit tests
   npm run test:rules    # Firestore rules tests
   ```

## Firebase Configuration

### Environment Variables

Create `.env.local` (not committed to git) with your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_SITE_URL=https://your-domain.com  # Your deployed URL
```

### Firebase Console Setup

1. **Authentication:** Enable Email/Password and Google sign-in providers
2. **Firestore:** Create a database in production mode
3. **Hosting:** Set up Firebase Hosting for deployment

### Deployment Commands

```bash
# Deploy hosting only
firebase deploy --only hosting

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy cloud functions
firebase deploy --only functions

# Deploy everything
firebase deploy
```

## Guest vs Signed-In Mode

- **Guest Mode:** Without signing in, all data lives in localStorage. No cloud sync.
- **First Sign-In:** On first sign-in, local data is uploaded if the cloud is empty; otherwise, the cloud snapshot is loaded.
- **Sync Status:** Displayed in-app. Failures are retried automatically and can be retried manually.

## Security & Privacy

### Data Storage

- **Guest users:** Data stays in browser (Zustand + localStorage)
- **Signed-in users:** Data syncs to Firestore under their account
- **IDs:** Generated via `crypto.randomUUID()` to avoid collisions/predictable identifiers

### Hosting Headers

Security headers are configured in `firebase.json`:
- CSP (Content Security Policy)
- HSTS (HTTP Strict Transport Security)
- Referrer-Policy
- Permissions-Policy
- COOP/COEP
- X-Content-Type-Options: nosniff

> **Note:** If you add new external assets, update the CSP allowlist. Currently only Google Fonts is allowed for styles/fonts.

### Firestore Rules Summary

The `firestore.rules` file enforces:

**Tournaments:**
- Read: any signed-in user
- Create: signed-in + uid in `memberIds` + shape validation
- Update: owner-only + shape validation
- Delete: owner-only (`ownerId == uid`)

**Game Sessions:**
- Read: any signed-in user
- Create/Update/Delete: owner or editor only (viewers cannot modify)

**Users:**
- Read: any signed-in user (for player code lookups)
- Write: own doc only

**Libraries:**
- Read: owner only (unless public)
- Write: owner only
- Public libraries readable by anyone with the link

**Shape Validation:**
- String lengths: name ≤25, description ≤60, gameName ≤80
- List sizes: players ≤100, sessions ≤500, participants ≤200

Rules tests are located in `tests/rules/firestore.rules.test.ts`. Run with `npm run test:rules`.

## SEO, PWA, and Icons

### Per-Route Meta Tags

Pages use a shared `SEO` component for:
- Title and description
- Canonical URLs
- Open Graph tags
- Twitter Card tags

Set `VITE_SITE_URL` in your environment for correct canonical/OG URLs.

### PWA Configuration

Service worker via `vite-plugin-pwa`:
- Manifest: `public/manifest.json`
- Icons: SVG + PNG (favicon set, Android 192/512, maskable 512)
- Apple touch icon included
- Automatic background updates (hard refresh pulls latest if stale)

> **Tip:** If adding a 1200x630 OG image, update `seoDefaults.image` in `src/seo.ts`.

## Accessibility

BoardBrawl follows accessibility best practices:

- **Skip-to-content link:** Visible focus outlines for keyboard users
- **Landmarks:** Proper `main` and navigation landmarks
- **Forms:** Errors use `aria-invalid` and `aria-describedby`
- **Tables:** `aria-sort` attributes and captions
- **Keyboard navigation:** All interactive elements accessible via keyboard
- **Screen readers:** Decorative icons marked with `aria-hidden="true"`

> **Note:** Keep keyboard operability in mind for new interactions, especially drag-and-drop alternatives.

## Code Quality

### Linting

```bash
npm run lint
```

ESLint configuration in `eslint.config.js`.

### Type Checking

```bash
npm run typecheck
```

TypeScript configuration in `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json`.

## Troubleshooting

### Common Issues

**"Firebase not configured"**
- Ensure `.env.local` exists with all required variables
- Restart the dev server after creating `.env.local`

**"Firestore permission denied"**
- Check that Firestore rules are deployed
- Verify user is authenticated for protected routes
- Check browser console for detailed error messages

**PWA not updating**
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Clear service worker in DevTools → Application → Service Workers

**Build failures**
- Run `npm run typecheck` to find TypeScript errors
- Run `npm run lint` to find code quality issues
- Check for missing dependencies with `npm install`
