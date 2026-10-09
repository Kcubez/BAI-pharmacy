import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.ComponentProps<typeof Loader2> {
  className?: string;
}

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-muted-foreground", className)}
      {...props}
    />
  );
}
