import * as React from "react"
import { cn } from "../../utils/cn"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded border border-border-2 bg-white/50 px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-all disabled:cursor-not-allowed disabled:opacity-50 tabular",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded border border-border-2 bg-white/50 px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold transition-all disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Input, Textarea }
