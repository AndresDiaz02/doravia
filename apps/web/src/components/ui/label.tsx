import { cn } from "../../lib/cn";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-gray-700 dark:text-gray-300", className)}
      {...props}
    />
  );
}
