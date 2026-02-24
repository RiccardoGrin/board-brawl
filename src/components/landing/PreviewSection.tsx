import { PreviewCard } from './PreviewCard';

const previews = [
  {
    title: 'Virtual Bookshelf',
    description: 'Your collection displayed beautifully on a customizable shelf',
    imageSrc: '/screenshots/shelf-preview.png',
  },
  {
    title: 'Stats Dashboard',
    description: 'Track every win and achievement across all your games',
    imageSrc: '/screenshots/stats-preview.png',
  },
];

export function PreviewSection() {
  return (
    <section className="py-12" aria-labelledby="preview-heading">
      <h2 id="preview-heading" className="text-2xl font-bold text-ink engraved text-center mb-8">
        See It In Action
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {previews.map((preview) => (
          <PreviewCard
            key={preview.title}
            title={preview.title}
            description={preview.description}
            imageSrc={preview.imageSrc}
          />
        ))}
      </div>
    </section>
  );
}
