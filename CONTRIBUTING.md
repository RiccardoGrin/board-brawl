# Contributing to BoardBrawl

Thanks for your interest in contributing! BoardBrawl is open source and welcomes contributions of all kinds.

## Getting Started

### Prerequisites

- Node.js 20.19+ (22.x recommended)
- npm (included with Node.js)
- A Firebase project (free tier is sufficient)

### Setting Up Your Own Firebase Project

BoardBrawl requires a Firebase backend. Each contributor/deployment needs its own Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. **Enable Authentication:**
   - Go to Authentication → Sign-in method
   - Enable **Google** provider
   - Enable **Email/Password** provider (optional)
3. **Create Firestore Database:**
   - Go to Firestore Database → Create database
   - Choose production mode
   - Select a region close to your users
4. **Deploy Security Rules:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add  # Select your project
   firebase deploy --only firestore:rules
   ```
5. **Deploy Cloud Functions** (needed for BGG game search):
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
   After deployment, note your function URL — it will look like:
   `https://<region>-<project-id>.cloudfunctions.net/bggSearch`

6. **Get your Firebase config:**
   - Go to Project Settings → General → Your apps → Web app
   - Click "Add app" if none exists, then copy the config values

### Environment Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/boardbrawl.git
cd boardbrawl

# Install dependencies
npm install

# Create your environment file
cp env.example .env.local
```

Edit `.env.local` with your Firebase project values:

```env
VITE_SITE_URL=http://localhost:5173
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_BGG_SEARCH_URL=https://us-central1-your-project-id.cloudfunctions.net/bggSearch
VITE_FUNCTIONS_REGION=us-central1
BGG_API_TOKEN=your-bgg-api-token
```

> **Note:** The app works in guest mode (localStorage only) without Firebase credentials configured. You only need Firebase for sign-in and cloud sync features.

### BGG API Token

The BoardGameGeek search integration requires an API token. You can get one from the [BGG API](https://boardgamegeek.com/wiki/page/BGG_XML_API2).

### Running the App

```bash
# Start dev server
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Build for production
npm run build
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run lint: `npm run lint`
6. Commit with a descriptive message
7. Push to your fork and open a Pull Request

## Code Style

- TypeScript with strict mode
- React functional components with hooks
- Tailwind CSS for styling (follow the [Style Guide](STYLE_GUIDE.md))
- Zustand for state management
- Keep it simple — avoid over-engineering

## Project Structure

See [Architecture docs](docs/ARCHITECTURE.md) for detailed file structure and data flow.

## Deployment

BoardBrawl is designed to deploy on Firebase Hosting:

```bash
npm run build
firebase deploy --only hosting
```

You can also deploy to any static hosting provider (Vercel, Netlify, etc.) — just point it at the `dist/` output directory.

## Reporting Issues

Found a bug or have a feature request? [Open an issue](../../issues) with as much detail as possible.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
