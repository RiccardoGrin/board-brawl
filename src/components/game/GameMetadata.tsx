import { useState } from 'react';
import { ChevronDown, ChevronUp, Tag, Cog, Palette, Building2 } from 'lucide-react';
import type { GameRecord } from '../../services/gameSearch';

interface GameMetadataProps {
  game: GameRecord;
}

export function GameMetadata({ game }: GameMetadataProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['categories', 'mechanics'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const hasCategories = game.categories && game.categories.length > 0;
  const hasMechanics = game.mechanics && game.mechanics.length > 0;
  const hasDesigners = game.designers && game.designers.length > 0;
  const hasPublishers = game.publishers && game.publishers.length > 0;

  if (!hasCategories && !hasMechanics && !hasDesigners && !hasPublishers) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-ink engraved">Game Details</h2>

      <div className="card-medieval divide-y divide-gold-2/30">
        {/* Categories */}
        {hasCategories && (
          <MetadataSection
            icon={<Tag className="w-4 h-4" />}
            title="Categories"
            items={game.categories}
            isExpanded={expandedSections.has('categories')}
            onToggle={() => toggleSection('categories')}
          />
        )}

        {/* Mechanics */}
        {hasMechanics && (
          <MetadataSection
            icon={<Cog className="w-4 h-4" />}
            title="Mechanics"
            items={game.mechanics}
            isExpanded={expandedSections.has('mechanics')}
            onToggle={() => toggleSection('mechanics')}
          />
        )}

        {/* Designers */}
        {hasDesigners && (
          <MetadataSection
            icon={<Palette className="w-4 h-4" />}
            title="Designers"
            items={game.designers}
            isExpanded={expandedSections.has('designers')}
            onToggle={() => toggleSection('designers')}
          />
        )}

        {/* Publishers */}
        {hasPublishers && (
          <MetadataSection
            icon={<Building2 className="w-4 h-4" />}
            title="Publishers"
            items={game.publishers}
            isExpanded={expandedSections.has('publishers')}
            onToggle={() => toggleSection('publishers')}
          />
        )}
      </div>
    </div>
  );
}

interface MetadataSectionProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
  isExpanded: boolean;
  onToggle: () => void;
}

function MetadataSection({
  icon,
  title,
  items,
  isExpanded,
  onToggle,
}: MetadataSectionProps) {
  const displayItems = isExpanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;

  return (
    <div className="p-4">
      <button
        className="w-full flex items-center justify-between text-left group"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 text-ink font-medium">
          <span className="text-gold">{icon}</span>
          {title}
          <span className="text-xs text-muted">({items.length})</span>
        </div>
        {hasMore && (
          <span className="text-muted group-hover:text-gold transition-colors">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        )}
      </button>

      <div className="mt-2 flex flex-wrap gap-2">
        {displayItems.map((item, index) => (
          <span
            key={index}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gold/10 text-ink border border-gold-2/30"
          >
            {item}
          </span>
        ))}
        {!isExpanded && hasMore && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-muted">
            +{items.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}
