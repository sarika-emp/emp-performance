import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(date: string | Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale || document.documentElement.lang || "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
