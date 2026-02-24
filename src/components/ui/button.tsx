import * as React from "react"
import { cn } from "../../utils/cn"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

/**
 * A medieval-styled button component.
 * Standardizes interactions (hover/active) and typography.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: "btn-medieval btn-medieval-primary engraved",
      secondary: "btn-medieval engraved",
      outline: "btn-medieval border-dashed engraved",
      ghost: "hover:bg-[rgba(25,22,19,0.05)] text-ink engraved transition-all hover:translate-y-[-1px]",
      destructive: "bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 engraved shadow-soft transition-all hover:translate-y-[-2px] hover:shadow-md",
    }
    
    const sizes = {
      sm: "h-9 px-3 text-sm",      /* Slightly taller for better touch/feel */
      md: "h-11 px-5 py-2 text-base",
      lg: "h-13 px-8 text-lg",
      icon: "h-11 w-11 !p-0",
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
