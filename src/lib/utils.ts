import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  let cleaned = String(phone).trim();
  cleaned = cleaned.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+959")) {
    cleaned = "09" + cleaned.slice(4);
  } else if (cleaned.startsWith("959")) {
    cleaned = "09" + cleaned.slice(3);
  }
  if (cleaned.length === 9 && cleaned.startsWith("9")) {
    cleaned = "0" + cleaned;
  }
  return cleaned;
}
