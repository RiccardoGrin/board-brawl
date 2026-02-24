# Tournament Features

BoardBrawl supports two tournament formats: Multi-Game Tournaments and Single-Elimination Brackets.

## Multi-Game Tournaments

Multi-game tournaments allow you to play multiple different games and accumulate points across sessions. Perfect for game nights with various games.

### Creating a Multi-Game Tournament

1. Click "New Tournament" from the dashboard
2. **Step 1:** Select "Multi-Game Tournament" format
3. **Step 2:** Enter tournament details:
   - Tournament name (required)
   - Description (optional)
4. **Step 3:** Add players (minimum 2, no maximum limit)
5. Click "Start" to create the tournament

### Flexible Game Logging

- **Free-for-All & Team Games:** Supports both individual and team-based scoring
- **Customizable Scoring:** Start with presets (Quick, Medium, Big) and edit points for each placement
- **Intuitive Ranking:** Drag-and-drop interface for ranking players and teams after each game

### Scoring Presets

| Preset | 1st | 2nd | 3rd | 4th | 5th+ |
| --- | --- | --- | --- | --- | --- |
| Quick | 3 | 2 | 1 | 0 | 0 |
| Medium | 5 | 3 | 2 | 1 | 0 |
| Big | 10 | 7 | 5 | 3 | 1 |

### Team Play

- Group players into teams using themed icons for each game session
- Teams are per-session (players can be on different teams each game)
- All team members receive the same placement points

---

## Bracket Tournaments

Single-elimination bracket tournaments are ideal for competitive play with a single game type.

### Creating a Bracket Tournament

1. Click "New Tournament" from the dashboard
2. **Step 1:** Select "Single-Elimination Bracket" format
3. **Step 2:** Enter tournament details:
   - Tournament name (required)
   - Description (optional)
   - Game title (required for bracket tournaments)
4. **Step 3:** Add players - exactly 4, 8, 16, or 32 players (power-of-2 requirement)
5. Players are seeded in the order you add them (first added = seed #1)

### Bracket Rules

| Rule | Description |
| --- | --- |
| Player Count | Must be exactly 4, 8, 16, or 32 players |
| Seeding | Sequential based on entry order (first = #1 seed) |
| Format | Single-elimination (lose once, you're out) |
| Rounds | Automatically calculated (4 players = 2 rounds, 8 = 3, 16 = 4, 32 = 5) |

### Managing Brackets

**Recording Matches:**
- Click any match with both players ready to record the winner
- Winner automatically advances to the next round
- Tournament completes when the finals are decided

**Editing Results:**
- Click any completed match to change or clear the winner
- Clearing a winner removes them from subsequent rounds
- Useful for fixing mistakes or handling disputes

**Managing Players:**
- Add or remove players at any time
- **Warning:** Changing players regenerates the bracket and resets ALL match results
- Player count must remain a valid power of 2 (4, 8, 16, or 32)
- Names and colors can be edited without resetting matches

### Bracket Views

**Desktop (≥768px):**
- All rounds displayed side-by-side in columns
- Visual connection lines between matches
- Horizontal scroll for larger brackets

**Mobile (<768px):**
- Dropdown to select which round to view
- One round displayed at a time
- Current round indicator

### Match States

| State | Appearance | Interaction |
| --- | --- | --- |
| Ready | Gold border | Clickable - both players assigned |
| Pending | Dashed border, TBD players | Not clickable - waiting for previous round |
| Complete | Green tint, checkmark | Clickable - editable |

### Standings

Bracket tournament standings show:
- **Rank:** Based on placement (Champion = 1, Runner-up = 2, etc.)
- **W-L Record:** Wins and losses for each player
- **Status:** Champion, Finals, Semi-Finals, Quarter-Finals, or round eliminated

### Key Differences from Multi-Game Tournaments

| Feature | Multi-Game | Bracket |
| --- | --- | --- |
| Format | Multiple games, accumulate points | Single game, elimination |
| Players | 2+ (any number) | 4, 8, 16, or 32 only |
| Games | Multiple game types | One game type |
| Scoring | Points per game | Win/Loss |
| Editing Players | Allowed if not in games | Allowed (resets all matches) |
| Team Play | Supported | Not supported (1v1 only) |

---

## Player Sharing & User Codes

Each signed-in user is automatically assigned a unique 6-digit **player code** (e.g., `#847291`) on account creation. This code enables privacy-friendly player sharing without exposing email addresses.

### How It Works

1. **Find your code:** Click your profile icon → Account Settings → your code is displayed with a copy button
2. **Set your display name:** In Account Settings, set a custom name (1-25 chars) that will appear in shared tournaments instead of "Player #123456"
3. **Share your code:** Give your code to tournament organizers so they can add you
4. **Add linked players:** When creating or editing a tournament, type `#123456` to search for and link a registered user
5. **Quick add yourself:** Use the "Add Me" or "Add Myself" button to instantly add yourself to any tournament
6. **Automatic access:** Linked players see the tournament in their "Shared with You" section

### Display Name Priority

Display names are shown in this order of preference:
1. Custom display name (set in Account Settings)
2. Google display name (if signed in via Google)
3. "Player #[code]" if no name is set

> **Privacy:** Email addresses are never displayed.

### Roles

| Role | Permissions |
| --- | --- |
| `owner` | Full control (create, edit, delete tournaments and games) |
| `editor` | Can add games and players (future feature) |
| `viewer` | Read-only access (default for linked players) |

### Implementation Details

- User codes are stored in `/users/{uid}.userCode`
- Custom display names are stored in `/users/{uid}.displayName` (separate from Firebase Auth displayName)
- Codes are generated with retry logic to handle rare collisions (900k possible codes)
- Linked players are added to `tournament.memberIds` with `viewer` role in `tournament.memberRoles`
- The `PlayerInput` component handles code detection and user lookup with debouncing
- Duplicate prevention: users cannot be linked to multiple players in the same tournament
- Owner display names are fetched dynamically to always show current name in "Hosted by"
- Users can add themselves to tournaments via #code or "Add Me" buttons

---

## Tournament Lifecycle

### Active Tournament

- Add game sessions (multi-game) or record match results (bracket)
- Edit players, names, and colors
- View live leaderboard and statistics
- Share with other players via their user codes

### Finished Tournament

- Click "End Tournament" to mark as finished
- Finished tournaments are locked (no edits allowed)
- Final results preserved as a "hall of fame"
- Finished badge displayed next to tournament title
- Role-based UI: edit/delete actions hidden for non-owners

---

## Statistics & Leaderboard

### Multi-Game Statistics

- **Total Points:** Sum of all points earned across games
- **Games Played:** Number of games participated in
- **Average Points:** Points per game average
- **Player History:** Expand any row to see game-by-game breakdown

### Bracket Statistics

- **W-L Record:** Wins and losses
- **Placement:** Champion, Runner-up, Semi-Finals, etc.
- **Round Eliminated:** Which round the player was knocked out

### Sorting Options

- Sort by total points, games played, or average points per game
- Click column headers to toggle sort direction

---

## Common Issues & Troubleshooting

### "Bracket tournaments require exactly 4, 8, 16, or 32 players"

- You must have an exact power-of-2 player count
- Add or remove players until you reach a valid count
- The validation appears when creating the tournament

### "Adding or removing players will reset all match results"

- This is intentional—changing players requires regenerating the bracket
- All match results are cleared when the bracket regenerates
- Player names and colors can be edited without affecting matches

### Match shows "TBD" for one or both players

- The match is waiting for a previous round to complete
- Complete earlier matches to advance winners forward
- TBD matches cannot be clicked until both players are determined

### Winner not advancing to next round

- This should happen automatically—check browser console for errors
- Try refreshing the page to see if state updates
- If persistent, try clearing the match result and re-recording

### Bracket not displaying correctly on mobile

- Use the dropdown at the top to switch between rounds
- Only one round displays at a time on small screens
- Desktop view (≥768px width) shows all rounds in columns

### Player code not found

- Ensure the player has created an account and signed in at least once
- Verify the code is typed correctly with the `#` prefix
- Codes are 6 digits (e.g., `#847291`)

### Can't see shared tournament

- Ensure you're signed in with the correct account
- The tournament owner must have linked your player code
- Check the "Shared with You" section on the dashboard
