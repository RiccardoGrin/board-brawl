import type { LucideIcon } from 'lucide-react';

interface ShieldIconProps {
  icon: LucideIcon;
  className?: string;
}

export function ShieldIcon({ icon: Icon, className = '' }: ShieldIconProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {/* Left decorative line */}
      <div className="w-8 sm:w-12 h-px bg-gold-2 mr-2" />

      {/* Shield with icon */}
      <div className="relative w-16 h-20 flex-shrink-0">
        {/* Shield background */}
        <svg
          viewBox="0 0 64 72"
          fill="none"
          className="w-full h-full"
          aria-hidden="true"
        >
          {/* Shield fill */}
          <path
            d="M32 4l24 10v20c0 18-10 26-24 32C18 60 8 52 8 34V14l24-10Z"
            fill="url(#shieldGradient)"
            stroke="#b8923b"
            strokeWidth="2"
          />
          <defs>
            <linearGradient id="shieldGradient" x1="32" y1="4" x2="32" y2="66" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f4efe5" />
              <stop offset="100%" stopColor="#e8e0d0" />
            </linearGradient>
          </defs>
        </svg>
        {/* Icon centered inside */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-7 h-7 text-gold" strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>

      {/* Right decorative line */}
      <div className="w-8 sm:w-12 h-px bg-gold-2 ml-2" />
    </div>
  );
}
