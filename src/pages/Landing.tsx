import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { HeroSection, FeatureSection } from '../components/landing';
import { useAuthModalStore } from '../store/authModalStore';
import { AuthMenu } from '../components/AuthMenu';
import { Button } from '../components/ui/button';

export default function Landing() {
  const requestSignUp = useAuthModalStore((state) => state.requestSignUp);

  return (
    <div className="min-h-screen page-frame">
      <SEO
        path="/"
        title="BoardBrawl | The Ultimate Game Night Scorekeeper"
        description="Track scores, run tournaments, and manage your board game collection with BoardBrawl. The ultimate companion for game night."
      />

      {/* AuthMenu (hidden, listens for requestedMode to open the auth modal) */}
      <div className="hidden"><AuthMenu /></div>

      {/* Header */}
      <header className="landing-header sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Name */}
            <Link to="/" className="flex items-center gap-2 group">
              <img
                src="/favicon.svg"
                alt=""
                className="w-10 h-10"
                aria-hidden="true"
              />
              <span className="font-display text-3xl font-bold text-ink engraved group-hover:text-gold transition-colors leading-none">
                BoardBrawl
              </span>
            </Link>

            {/* Right: CTA */}
            <Button
              variant="primary"
              size="sm"
              onClick={requestSignUp}
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" role="main" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <HeroSection onGetStarted={requestSignUp} />
        <FeatureSection onGetStarted={requestSignUp} />
      </main>
    </div>
  );
}
