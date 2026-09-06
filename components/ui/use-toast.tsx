import { useCallback } from "react";
import { notify, type NotificationType } from "./notification-provider";

export type ToastType = "success" | "error" | "info" | "warning";

export function showToast(type: ToastType, text: string, title?: string) {
  notify(type as NotificationType, text, title);
  if (type === "success" && /DMT transfer completed successfully\.?/i.test(text)) {
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.reload();
    }, 900);
  }
}

export function useToast() {
  const triggerToast = useCallback((type: ToastType, text: string, title?: string) => {
    showToast(type, text, title);
  }, []);

  return { showToast: triggerToast, toastView: null };
}