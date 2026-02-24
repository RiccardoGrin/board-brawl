import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, ChevronLeft, UserPlus, Swords, Gamepad2 } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { Button } from '../components/ui/button';
import { ColorSelector } from '../components/ui/color-selector';
import { GameInput } from '../components/ui/game-input';
import { PlayerInput } from '../components/ui/player-input';
import { PREDEFINED_COLORS, getRandomColor } from '../utils/colors';
import { cn } from '../utils/cn';
import { SEO } from '../components/SEO';
import { AuthMenu } from '../components/AuthMenu';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import type { TournamentFormat } from '../types/tournament';

// Form validation constants
const NAME_MAX = 25;
const DESCRIPTION_MAX = 60;
const GAME_TITLE_MAX = 80;
const COUNTER_THRESHOLD = {
  name: Math.ceil(NAME_MAX * 0.8),
  description: Math.ceil(DESCRIPTION_MAX * 0.8),
  gameTitle: Math.ceil(GAME_TITLE_MAX * 0.8),
};

/**
 * Zod schema for tournament creation form validation.
 * Enforces:
 * - Tournament name: 3-25 characters
 * - Description: optional, max 60 characters
 * - Format: 'accumulative' or 'bracket'
 * - Game title: required for bracket format only, max 80 characters
 * - Players: minimum 2, with bracket requiring exactly 4, 8, 16, or 32 players
 */

const tournamentSchema = z.object({
  name: z.string().min(3, "Tournament name must be at least 3 characters").max(NAME_MAX, `Tournament name cannot exceed ${NAME_MAX} characters`),
  description: z.string().max(DESCRIPTION_MAX, `Description cannot exceed ${DESCRIPTION_MAX} characters`).optional(),
  format: z.enum(['accumulative', 'bracket']).optional(),
  gameTitle: z.string().max(GAME_TITLE_MAX, `Game name cannot exceed ${GAME_TITLE_MAX} characters`).optional(),
  gameId: z.string().optional(),
  gameSourceIds: z.object({ bgg: z.string().optional() }).optional(),
  gameMeta: z.object({
    minPlayers: z.number().optional(),
    maxPlayers: z.number().optional(),
    minPlaytime: z.number().optional(),
    maxPlaytime: z.number().optional(),
    playingTime: z.number().optional(),
    thumbnail: z.string().optional(),
    year: z.number().optional(),
  }).optional(),
  players: z.array(z.object({
    name: z.string().min(1, "Player name is required"),
    color: z.string().optional(),
    userId: z.string().optional()
  })).min(2, "At least 2 players are required")
}).refine(
  data => {
    // If format is bracket, require exactly 4, 8, 16, or 32 players
    if (data.format === 'bracket') {
      const validCounts = [4, 8, 16, 32];
      return validCounts.includes(data.players.length);
    }
    return true;
  },
  {
    message: "Bracket tournaments require exactly 4, 8, 16, or 32 players",
    path: ["players"]
  }
).refine(
  data => {
    // If format is bracket, require gameTitle
    if (data.format === 'bracket') {
      return data.gameTitle && data.gameTitle.trim().length > 0;
    }
    return true;
  },
  {
    message: "Game name is required for bracket tournaments",
    path: ["gameTitle"]
  }
);

type TournamentFormValues = z.infer<typeof tournamentSchema>;

/**
 * NewTournament - Multi-step tournament creation wizard
 * 
 * This component implements a 3-step process for creating tournaments:
 * 
 * **Step 1: Format Selection**
 * - Choose between Multi-Game Tournament or Single-Elimination Bracket
 * - Large clickable cards with icons and descriptions
 * - Automatically advances to Step 2 on selection
 * 
 * **Step 2: Tournament Details**
 * - Tournament name (required, 3-25 chars)
 * - Description (optional, max 60 chars)
 * - Game name (required for bracket only, max 80 chars)
 * - Character counters shown when approaching limits
 * - Validates only Step 2 fields before advancing
 * 
 * **Step 3: Add Players**
 * - Player list with color selectors
 * - Default counts: 2 for Multi-Game, 4 for Bracket
 * - Remove buttons only shown when above minimum (2 or 4)
 * - "Add Myself" button for signed-in users (side-by-side on desktop, stacked on mobile)
 * - "New Player" button to add additional players
 * - Bracket tournaments enforce power-of-2 player counts (4, 8, 16, or 32)
 * 
 * **Features:**
 * - Back navigation preserves form data
 * - Player linking via user codes (#123456)
 * - Automatic color assignment
 * - Responsive layout (cards side-by-side on desktop, stacked on mobile)
 * - Targeted validation per step (no cascading errors)
 * - Smooth animations between steps
 * 
 * @returns {JSX.Element} The multi-step tournament creation form
 */
export default function NewTournament() {
  const navigate = useNavigate();
  const createTournament = useTournamentStore(state => state.createTournament);
  const user = useAuthStore(state => state.user);
  const userProfile = useAuthStore(state => state.userProfile);

  // Get owned game IDs for the dropdown badge
  const userGames = useLibraryStore(state => state.userGames);
  const ownedGameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [gameId, game] of Object.entries(userGames)) {
      if (game.status === 'owned') {
        ids.add(gameId);
      }
    }
    return ids;
  }, [userGames]);

  // Step state: 1 = Format Selection, 2 = Tournament Details, 3 = Add Players
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm<TournamentFormValues>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
      description: '',
      format: 'accumulative',
      gameTitle: '',
      gameId: undefined,
      gameSourceIds: undefined,
      gameMeta: undefined,
      players: [
        { name: '', color: PREDEFINED_COLORS[0] }, 
        { name: '', color: PREDEFINED_COLORS[1] }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "players"
  });

  const watchName = watch('name', '');
  const watchDescription = watch('description', '') || '';
  const watchFormat = watch('format', 'accumulative');
  const watchGameTitle = watch('gameTitle', '') || '';
  const watchGameId = watch('gameId');
  const watchGameSourceIds = watch('gameSourceIds');
  const watchGameMeta = watch('gameMeta');
  const watchPlayers = watch('players');

  useEffect(() => {
    register('gameTitle');
  }, [register]);

  const onSubmit = (data: TournamentFormValues) => {
    createTournament(
      data.name, 
      data.description, 
      data.players,
      data.format,
      data.gameTitle,
      {
        gameId: data.gameId,
        gameSourceIds: data.gameSourceIds,
        gameMeta: data.gameMeta,
      }
    );
    
    // Get the newly created tournament ID from the store
    const tournamentId = useTournamentStore.getState().activeTournamentId;
    if (tournamentId) {
      navigate(`/tournament/${tournamentId}`);
    }
  };

  const pickNextColor = () => {
    const currentColors = (watchPlayers || []).map(p => p.color).filter((c): c is string => Boolean(c));
    const unusedPreset = PREDEFINED_COLORS.find(color => !currentColors.includes(color));
    if (unusedPreset) return unusedPreset;
    return getRandomColor(currentColors);
  };

  const handleFormatSelect = (format: TournamentFormat) => {
    setValue('format', format);
    
    // Set default players for bracket format (4 players)
    if (format === 'bracket') {
      const currentPlayers = watchPlayers.length;
      // Add players to reach 4 if needed
      if (currentPlayers < 4) {
        for (let i = currentPlayers; i < 4; i++) {
          append({ name: '', color: PREDEFINED_COLORS[i % PREDEFINED_COLORS.length] });
        }
      }
    }
    
    setStep(2);
  };

  const handleBackFromStep2 = () => {
    setStep(1);
  };

  const handleNextFromStep2 = () => {
    // Validate step 2 fields only (not player fields)
    const hasName = watchName.trim().length >= 3;
    const hasGameTitle = watchFormat === 'bracket' ? (watchGameTitle?.trim().length || 0) > 0 : true;
    
    if (!hasName || !hasGameTitle) {
      // Manually trigger validation for specific fields
      if (!hasName) {
        setValue('name', watchName, { shouldValidate: true });
      }
      if (watchFormat === 'bracket' && !hasGameTitle) {
        setValue('gameTitle', watchGameTitle, { shouldValidate: true });
      }
      return;
    }
    
    setStep(3);
  };

  const handleBackFromStep3 = () => {
    setStep(2);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return 'Tournament Format';
      case 2:
        return 'Tournament Details';
      case 3:
        return 'Add Players';
      default:
        return 'New Tournament';
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 page-frame relative">
      <SEO 
        path="/new"
        title="Create a new tournament"
        description="Create a new BoardBrawl tournament, add players, and set your house rules."
      />
      {/* Profile icon - fixed position */}
      <div className="fixed top-12 right-4 sm:right-6 lg:right-8 z-[100]">
        <AuthMenu />
      </div>
      <div className="max-w-4xl mx-auto card-medieval p-8 sm:p-10">
        <main id="main-content" role="main">
          {/* Navigation / Header */}
          <div className="flex items-start gap-5">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3) : navigate('/')} 
              className="-ml-3 text-muted mt-0.5"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-ink engraved tracking-tight">{getStepTitle()}</h2>
              <div className="divider-line opacity-60 mt-4" />
            </div>
          </div>

          {/* Step 1: Format Selection */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-10">
              <div className="grid sm:grid-cols-2 gap-5">
                <button
                  type="button"
                  onClick={() => handleFormatSelect('accumulative')}
                  className="card-medieval p-6 cursor-pointer transition-all group text-left hover:border-gold hover:translate-y-[-2px] hover:shadow-soft"
                >
                  <div className="flex flex-col sm:flex-col items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                      <Gamepad2 className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="flex-1 w-full">
                      <div className="font-bold text-lg text-ink engraved mb-2 group-hover:text-gold transition-colors">Multi-Game Tournament</div>
                      <div className="text-base text-muted leading-relaxed">
                        Play multiple games and accumulate points across sessions. Best for game nights with various games.
                      </div>
                    </div>
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleFormatSelect('bracket')}
                  className="card-medieval p-6 cursor-pointer transition-all group text-left hover:border-gold hover:translate-y-[-2px] hover:shadow-soft"
                >
                  <div className="flex flex-col sm:flex-col items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                      <Swords className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="flex-1 w-full">
                      <div className="font-bold text-lg text-ink engraved mb-2 group-hover:text-gold transition-colors">Single-Elimination Bracket</div>
                      <div className="text-base text-muted leading-relaxed">
                        One-on-one matches, single game type. Perfect for competitive tournaments with a single winner.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Tournament Details */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 mt-10">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-end mb-2.5 px-1">
                    <label htmlFor="tournamentName" className="block text-base font-bold text-muted engraved">
                      Tournament Name
                    </label>
                    {watchName.length >= COUNTER_THRESHOLD.name && (
                      <span className="text-[10px] text-muted tabular">
                        {watchName.length}/{NAME_MAX}
                      </span>
                    )}
                  </div>
                  <input 
                    id="tournamentName"
                    {...register('name')} 
                    placeholder="e.g. Friday Game Night"
                    maxLength={NAME_MAX}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'tournamentName-error' : undefined}
                    className={cn(
                      "h-12 text-base w-full bg-paper/70 px-4",
                      errors.name ? 'border-red-300' : 'border-gold-2/30 focus:border-gold'
                    )}
                  />
                  {errors.name && (
                    <p id="tournamentName-error" className="mt-2.5 text-sm text-red-500 engraved" role="alert" aria-live="polite">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2.5 px-1">
                    <label htmlFor="tournamentDescription" className="block text-base font-bold text-muted engraved">
                      Description (Optional)
                    </label>
                    {watchDescription.length >= COUNTER_THRESHOLD.description && (
                      <span className="text-[10px] text-muted tabular">
                        {watchDescription.length}/{DESCRIPTION_MAX}
                      </span>
                    )}
                  </div>
                  <input 
                    id="tournamentDescription"
                    {...register('description')} 
                    placeholder="e.g. First to 20 points. 100$ prize win!"
                    maxLength={DESCRIPTION_MAX}
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={errors.description ? 'tournamentDescription-error' : undefined}
                    className={cn(
                      "h-12 text-base w-full bg-paper/70 border-gold-2/30 focus:border-gold px-4",
                      errors.description && 'border-red-300'
                    )}
                  />
                  {errors.description && (
                    <p id="tournamentDescription-error" className="mt-2.5 text-sm text-red-500 engraved" role="alert" aria-live="polite">{errors.description.message}</p>
                  )}
                </div>

                {/* Game Title field - only shown for bracket format */}
                {watchFormat === 'bracket' && (
                  <div>
                    <div className="flex justify-between items-end mb-2.5 px-1">
                      <label htmlFor="gameTitle" className="block text-base font-bold text-muted engraved">
                        Game Name
                      </label>
                      {watchGameTitle.length >= COUNTER_THRESHOLD.gameTitle && (
                        <span className="text-[10px] text-muted tabular">
                          {watchGameTitle.length}/{GAME_TITLE_MAX}
                        </span>
                      )}
                    </div>
                    <GameInput
                      value={watchGameTitle}
                      onChange={(val) => {
                        setValue('gameTitle', val.slice(0, GAME_TITLE_MAX));
                        setValue('gameId', undefined);
                        setValue('gameSourceIds', undefined);
                        setValue('gameMeta', undefined);
                      }}
                      onSelect={(choice) => {
                        setValue('gameTitle', choice.name.slice(0, GAME_TITLE_MAX));
                        setValue('gameId', choice.gameId);
                        setValue('gameSourceIds', choice.sourceIds);
                        setValue('gameMeta', choice.meta);
                      }}
                      selectedGame={
                        watchGameTitle && (watchGameId || watchGameSourceIds?.bgg)
                          ? {
                              name: watchGameTitle,
                              gameId: watchGameId,
                              sourceIds: watchGameSourceIds,
                              meta: watchGameMeta,
                            }
                          : null
                      }
                      placeholder="e.g. Catan, Wingspan, Uno"
                      aria-label="Game name"
                      aria-invalid={Boolean(errors.gameTitle)}
                      aria-describedby={errors.gameTitle ? 'gameTitle-error' : undefined}
                      ownedGameIds={ownedGameIds}
                    />
                    {errors.gameTitle && (
                      <p id="gameTitle-error" className="mt-2.5 text-sm text-red-500 engraved" role="alert" aria-live="polite">{errors.gameTitle.message}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-6">
                <Button type="button" variant="ghost" className="flex-1 h-12" onClick={handleBackFromStep2}>
                  Back
                </Button>
                <Button type="button" variant="primary" className="flex-[2] h-12 text-base" onClick={handleNextFromStep2}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Players */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 mt-10">
              {watchFormat === 'bracket' && (
                <p className="text-sm text-muted px-1">
                  Bracket tournaments require exactly 4, 8, 16, or 32 players. Players will be seeded in the order you add them.
                </p>
              )}

              <div>
                <div className="space-y-5">
                  {fields.map((field, index) => {
                    const currentColor = watchPlayers?.[index]?.color || PREDEFINED_COLORS[index % PREDEFINED_COLORS.length];
                    const currentName = watchPlayers?.[index]?.name || '';
                    const currentUserId = watchPlayers?.[index]?.userId;
                    
                    // Determine minimum players based on format
                    const minPlayers = watchFormat === 'bracket' ? 4 : 2;
                    const canRemove = fields.length > minPlayers;
                    
                    return (
                      <div key={field.id} className="flex gap-4 items-start animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="mt-1.5">
                           <ColorSelector 
                             color={currentColor} 
                             onChange={(color) => setValue(`players.${index}.color`, color)} 
                           />
                        </div>

                        <div className="flex-1">
                          {user ? (
                            <PlayerInput
                              value={currentName}
                              onChange={(value) => setValue(`players.${index}.name`, value)}
                              onUserLinked={(userId, displayName) => {
                                setValue(`players.${index}.userId`, userId);
                                if (displayName) {
                                  setValue(`players.${index}.name`, displayName);
                                }
                              }}
                              onUserUnlinked={() => {
                                setValue(`players.${index}.userId`, undefined);
                              }}
                              linkedUserId={currentUserId}
                              existingUserIds={watchPlayers
                                ?.filter((_p, i) => i !== index)
                                .map(p => p.userId)
                                .filter((id): id is string => !!id) || []
                              }
                              showUnlinkButton={false}
                              placeholder="Player Name or #code"
                              aria-label={`Player ${index + 1} name`}
                              aria-invalid={Boolean(errors.players?.[index]?.name)}
                              aria-describedby={errors.players?.[index]?.name ? `player-${index}-error` : undefined}
                            />
                          ) : (
                            <input
                              aria-label={`Player ${index + 1} name`}
                              {...register(`players.${index}.name`)}
                              placeholder="Player Name"
                              aria-invalid={Boolean(errors.players?.[index]?.name)}
                              aria-describedby={errors.players?.[index]?.name ? `player-${index}-error` : undefined}
                              className={cn(
                                "h-11 text-base w-full bg-paper/70 px-4",
                                errors.players?.[index]?.name ? 'border-red-300' : 'border-gold-2/30 focus:border-gold'
                              )}
                            />
                          )}
                          {errors.players?.[index]?.name && (
                            <p id={`player-${index}-error`} className="mt-2.5 text-sm text-red-500 engraved" role="alert" aria-live="polite">{errors.players[index]?.name?.message}</p>
                          )}
                        </div>
                        
                        {canRemove && (
                          <Button 
                            type="button" 
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove player ${index + 1}`}
                            onClick={() => remove(index)}
                            className="text-muted hover:text-red-600 mt-0.5 h-11 w-11"
                          >
                            <Trash2 className="w-6 h-6" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Add Myself and New Player Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mt-6 sm:justify-center sm:items-center">
                  {/* Add Me Button - only show if user is logged in and not already in players list */}
                  {user && userProfile.userCode && !watchPlayers.some(p => p.userId === user.uid) && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        const displayName = userProfile.displayName || `Player #${userProfile.userCode}`;
                        append({
                          name: displayName,
                          color: pickNextColor(),
                          userId: user.uid
                        });
                      }}
                      className="w-full sm:w-auto sm:min-w-[180px]"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Myself
                    </Button>
                  )}
                  
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => append({ name: '', color: pickNextColor() })}
                    className="w-full sm:w-auto sm:min-w-[180px]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Player
                  </Button>
                </div>
                
                {errors.players && errors.players.message && (
                  <p className="mt-4 text-sm text-red-500 engraved text-center" data-testid="player-array-error" role="alert" aria-live="polite">{errors.players.message}</p>
                )}
              </div>

              <div className="flex gap-4 pt-6">
                <Button type="button" variant="ghost" className="flex-1 h-12" onClick={handleBackFromStep3}>
                  Back
                </Button>
                <Button 
                  type="button" 
                  variant="primary" 
                  className="flex-[2] h-12 text-base"
                  onClick={handleSubmit(onSubmit)}
                >
                  Start
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
