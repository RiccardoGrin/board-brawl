import { useState } from 'react';
import { Trophy, BarChart3, Library, ImageOff } from 'lucide-react';
import { ShieldIcon } from './ShieldIcon';
import { Button } from '../ui/button';

const pillars = [
  {
    icon: Trophy,
    title: 'Run the Night',
    description: 'Run multi-game tournaments and single-elimination brackets for any game night.',
  },
  {
    icon: BarChart3,
    title: 'Track Everything',
    description: 'Get detailed stats, live leaderboards, and complete player history across all your games.',
  },
  {
    icon: Library,
    title: 'Show Your Collection',
    description: 'Display your board game library on a beautiful virtual shelf you can share.',
  },
];

interface FeatureSectionProps {
  onGetStarted?: () => void;
}

export function FeatureSection({ onGetStarted }: FeatureSectionProps) {
  const [shelfImageError, setShelfImageError] = useState(false);

  return (
    <section className="py-12 pb-20" aria-labelledby="features-heading">
      {/* Section Header */}
      <h2 id="features-heading" className="font-display text-2xl sm:text-3xl font-semibold text-ink engraved text-center mb-2">
        Everything You Need for Game Night
      </h2>
      <p className="text-muted text-center mb-10 max-w-lg mx-auto">
        Simple tools to organize, track, and share your tabletop experiences.
      </p>

      {/* Three Pillars in Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
        {pillars.map((pillar) => (
          <div key={pillar.title} className="card-medieval p-6 flex flex-col items-center text-center">
            <ShieldIcon icon={pillar.icon} className="mb-4" />
            <h3 className="font-display text-2xl font-semibold text-ink engraved mb-2">
              {pillar.title}
            </h3>
            <p className="text-muted text-sm max-w-[240px]">
              {pillar.description}
            </p>
          </div>
        ))}
      </div>

      {/* Your Collection, digitized Section */}
      <div className="mt-28 grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-8 items-center">
        {/* Left column: Text */}
        <div className="order-2 md:order-1">
          <h3 className="font-display text-2xl sm:text-3xl font-semibold text-ink engraved mb-3">
            Your Collection, digitized.
          </h3>
          <p className="text-muted mb-6">
            Your physical board game library, beautifully displayed in a virtual 2D shelf.
          </p>

          <Button
            variant="primary"
            size="md"
            onClick={onGetStarted}
          >
            Get Started
          </Button>
        </div>

        {/* Right column: Image */}
        <div className="order-1 md:order-2">
          <div className="card-medieval overflow-hidden">
            <div className="bg-gold-2/10 relative flex items-center justify-center">
              {shelfImageError ? (
                <div className="aspect-[1006/535] flex items-center justify-center text-center text-gold-2">
                  <div>
                    <ImageOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm opacity-70">Preview coming soon</p>
                  </div>
                </div>
              ) : (
                <img
                  src="/shelf-preview.png"
                  alt="2D Bookshelf preview showing a virtual game collection"
                  className="w-full h-auto"
                  loading="lazy"
                  onError={() => setShelfImageError(true)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
