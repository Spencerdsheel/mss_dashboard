import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary text-primary-foreground",
        secondary:   "border-transparent bg-chalk text-graphite",
        destructive: "border-transparent bg-red-100 text-red-700",
        outline:     "border-chalk text-graphite",
        success:     "border-transparent bg-[#ff682c]/10 text-[#ff682c]",
        warning:     "border-transparent bg-[#816729]/10 text-[#816729]",
        info:        "border-transparent bg-chalk text-graphite",
        brand:       "border-transparent bg-brand text-brand-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
