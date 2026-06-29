import { cn } from "../../lib/cn";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-action focus:outline-none focus:ring-1 focus:ring-action disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:text-gray-500",
        className,
      )}
      {...props}
    />
  );
}
