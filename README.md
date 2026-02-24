# BoardBrawl: The Ultimate Game Night Scorekeeper

BoardBrawl is a sleek and modern web application designed to manage casual, multi-game tournaments for friends and family. No more messy spreadsheets or forgotten scores—BoardBrawl makes it easy to track every game, see who's winning, and crown the ultimate champion.

Whether you're battling it out in free-for-all classics or teaming up for epic showdowns, BoardBrawl handles all the scoring so you can focus on the fun.

## Key Features

### Tournament Management
    - **Multi-Game Tournaments:** Play multiple games and accumulate points across sessions. Perfect for game nights with various games.
    - **Single-Elimination Brackets:** One-on-one matches with automatic bracket generation and advancement. Ideal for competitive tournaments with a single game type.
- **Tournament Lifecycle:** Create, manage, and conclude tournaments with a single click. Finished tournaments are locked as a "hall of fame".

### Player System
- **Player Sharing:** Link registered users to tournaments using their unique 6-digit player code (`#123456`). Linked players see shared tournaments in their account without exposing email addresses.
- **Dynamic Player Management:** Assign each player a unique color, group players into teams, and edit rosters on the fly.
- **Role-Based Access:** Owners have full control, editors can add games and players, viewers have read-only access.

### Board Game Library
- **Virtual Collection:** Catalog your physical board game collection with BGG integration for automatic metadata.
- **Virtual Shelf View:** Display your games in a customizable 2D grid that resembles real board game shelves.
- **Multiple Libraries:** Create separate libraries (e.g., "Home Collection", "Office Games") with public/private visibility.
- **AI Photo Import:** Upload a photo of your board game shelf and let Gemini AI automatically detect and import your games into the virtual library.

### Statistics & Tracking
    - **Live Leaderboard:** See rankings update in real-time as games are added.
- **Sortable Stats:** Sort by total points, games played, or average points per game.
- **Player History:** Expand any player's row to see their complete game history.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`.

## Configuration

### Environment Variables

Copy `env.example` to `.env.local` and fill in your Firebase project values. See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions.

```bash
cp env.example .env.local
```

> **Note:** The app works in guest mode (localStorage only) without any Firebase config. You only need Firebase for sign-in and cloud sync.

### Firebase Setup

Each contributor/deployment needs its own Firebase project (free tier is fine). See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step instructions covering Authentication, Firestore, Cloud Functions, and security rules.

### Cloud Functions CORS

Cloud Functions default to allowing `localhost` origins only. To allow your production domain, set the `ALLOWED_ORIGINS` environment variable on your Firebase functions:

```bash
firebase functions:config:set cors.allowed_origins="https://your-domain.com,http://localhost:5173"
```

### SEO / Site URL

Set `VITE_SITE_URL` in your `.env.local` to your production URL for correct canonical URLs and Open Graph tags. Defaults to `http://localhost:5173`.

### Firestore Rules Tests

Rules tests use the Firebase emulator with a `demo-*` project prefix (no real Firebase project needed):

```bash
npm run test:rules
```

## Tech Stack

- **Framework:** [React](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand) (with `persist` for localStorage)
- **Routing:** [React Router](https://reactrouter.com/)
- **Forms & Validation:** [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Drag & Drop:** [@hello-pangea/dnd](https://github.com/hello-pangea/dnd)
- **Icons & UI:** [Lucide React](https://lucide.dev/)

## Design System

The project follows a **Modern Medieval** aesthetic. For colors, typography, and component styling, see the [Style Guide](STYLE_GUIDE.md).

## Documentation

| Document | Description |
| --- | --- |
| [Development Guide](docs/DEVELOPMENT.md) | Setup, deployment, Firebase configuration, and security |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture, file structure, and data flow |
| [Database](docs/DATABASE.md) | Firestore schema, data models, and security rules |
| [Tournament Features](docs/TOURNAMENT_FEATURES.md) | Multi-game and bracket tournaments, player sharing |
| [Library Feature](docs/LIBRARY_FEATURE.md) | Board game library and virtual shelf view |
| [Roadmap](docs/ROADMAP.md) | Future development phases and planned features |
| [BGG API Integration](docs/BGG_API_INTEGRATION.md) | BoardGameGeek API integration details |
| [Style Guide](STYLE_GUIDE.md) | Design system and component styling |

## AI Features & Admin Setup

BoardBrawl includes an AI-powered **photo import** feature that uses Google's Gemini Vision to scan a photo of your board game shelf and automatically detect game titles. Detected games are matched against BoardGameGeek and can be imported directly into your virtual library.

This feature is gated behind an **admin** (or premium) account tier. To enable it for your deployment:

### 1. Set up Gemini API access

```bash
# Store your Gemini API key as a Firebase secret
firebase functions:secrets:set GEMINI_API_KEY

# Deploy the Cloud Functions
firebase deploy --only functions
```

### 2. Grant yourself admin access

In the Firebase Console, go to **Firestore** → `users` collection → your user document (by UID), and set:

```
accountTier: "admin"
```

Alternatively, to grant only the photo import feature without full admin access, add `"aiPhotoImport"` to the `features` array on the user document.

### 3. Use the feature

Once you're an admin, an **"Import from Photo"** button appears in the library view. Upload or capture a photo, review the detected games, and import them into any library.

### Admin: Game Thumbnail Focal Points

Admins also get a **"Save to Games"** button in the game edit modal. This lets you set the focal point (visible crop area) for a game's thumbnail image in the shared `/games` collection. The focal point ensures game box art displays nicely in the virtual 2D shelf for all users.

## Guest vs Signed-In Mode

- **Guest Mode:** Data stays in your browser (localStorage). No account required to try the app.
- **Signed-In Mode:** Data syncs to Firebase Firestore. Share tournaments with friends, access from any device.
- **First Sign-In:** If you've been using guest mode, your local data is uploaded on first sign-in (if cloud is empty).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, including how to configure your own Firebase project.

## License

This project is licensed under the [MIT License](LICENSE).
