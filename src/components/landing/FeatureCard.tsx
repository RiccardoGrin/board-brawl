import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="card-medieval p-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-gold/10 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-gold" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-bold text-ink engraved mb-2">{title}</h3>
      <p className="text-muted text-base">{description}</p>
    </div>
  );
}
