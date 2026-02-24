import { Gamepad2, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { GameSessionCard } from './GameSessionCard';
import type { GameSession } from '../../types/tournament';

interface GameSessionListProps {
  sessions: GameSession[];
  onLogPlayClick: () => void;
}

export function GameSessionList({
  sessions,
  onLogPlayClick,
}: GameSessionListProps) {
  return (
    <section aria-labelledby="play-history-heading">
      <div className="flex justify-between items-center mb-4">
        <h2 id="play-history-heading" className="text-lg font-bold text-ink engraved">
          Play History
        </h2>
        <Button variant="secondary" size="sm" onClick={onLogPlayClick}>
          <Plus className="w-4 h-4 mr-1" />
          Log Play
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="card-medieval p-8 text-center">
          <Gamepad2 className="w-10 h-10 text-gold-2 mx-auto mb-3" />
          <p className="text-muted mb-4">No plays recorded yet</p>
          <Button variant="primary" onClick={onLogPlayClick}>
            Log Your First Play
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <GameSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}
