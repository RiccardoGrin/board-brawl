import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface HeroSectionProps {
  onGetStarted: () => void;
}

export function HeroSection({ onGetStarted: _onGetStarted }: HeroSectionProps) {
  const [screenshotError, setScreenshotError] = useState(false);

  return (
    <section className="py-10 sm:py-16 text-center">
      {/* Logo icon with horizontal lines */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <div className="h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-gold-2" aria-hidden="true" />
        <img
          src="/favicon.svg"
          alt=""
          className="w-10 h-10 opacity-60"
          aria-hidden="true"
        />
        <div className="h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-gold-2" aria-hidden="true" />
      </div>

      {/* Main heading - display serif */}
      <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-ink engraved tracking-wide mb-4">
        Run Game Night Like a Pro
      </h1>

      {/* Subtext */}
      <p className="text-lg sm:text-xl text-muted mb-10 max-w-xl mx-auto">
        Track scores, run tournaments, and show off your board game collection with ease.
      </p>

      {/* Screenshot */}
      <div className="max-w-3xl mx-auto">
        <div className="relative rounded-xl overflow-hidden shadow-lg border border-border bg-white">
          {screenshotError ? (
            <div className="aspect-[16/10] flex items-center justify-center text-gold-2">
              <div className="text-center">
                <ImageOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm opacity-70">Screenshot coming soon</p>
              </div>
            </div>
          ) : (
            <img
              src="/hero-screenshot.png"
              alt="BoardBrawl app showing a leaderboard and tournament bracket"
              className="w-full h-auto"
              loading="eager"
              onError={() => setScreenshotError(true)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
