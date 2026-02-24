import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface PreviewCardProps {
  title: string;
  description: string;
  imageSrc: string;
}

export function PreviewCard({ title, description, imageSrc }: PreviewCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="card-medieval overflow-hidden">
      <div className="aspect-video bg-gold-2/10 relative flex items-center justify-center">
        {imageError ? (
          <div className="text-center text-gold-2">
            <ImageOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm opacity-70">Preview coming soon</p>
          </div>
        ) : (
          <img
            src={imageSrc}
            alt={`${title} preview`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold text-ink engraved mb-2">{title}</h3>
        <p className="text-muted text-base">{description}</p>
      </div>
    </div>
  );
}
