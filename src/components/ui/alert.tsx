import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 rounded-xl border px-4 py-3 text-sm shadow-[0_1px_2px_rgb(15_23_42/0.04)] [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground",
        warning: "border-warning/30 bg-warning/8 text-foreground [&>svg]:text-warning",
        destructive: "border-destructive/25 bg-destructive/6 text-foreground [&>svg]:text-destructive",
        success: "border-success/25 bg-success/6 text-foreground [&>svg]:text-success",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function Alert({ className, variant, ...props }: React.ComponentProps<"section"> & VariantProps<typeof alertVariants>) {
  return <section data-slot="alert" role="status" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-semibold leading-5 text-foreground", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("mt-0.5 text-sm leading-5 text-muted-foreground", className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle, alertVariants }
