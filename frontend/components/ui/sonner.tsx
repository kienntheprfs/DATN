"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        ),
        info: (
          <InfoIcon className="size-4 text-blue-600 dark:text-blue-400" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-rose-600 dark:text-rose-400" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg border flex items-center gap-3 p-4 rounded-lg",
          success: "group-[.toast]:bg-emerald-50/80 group-[.toast]:text-emerald-900 group-[.toast]:border-emerald-200 dark:group-[.toast]:bg-emerald-950/20 dark:group-[.toast]:text-emerald-200 dark:group-[.toast]:border-emerald-800/30",
          error: "group-[.toast]:bg-rose-50/80 group-[.toast]:text-rose-900 group-[.toast]:border-rose-200 dark:group-[.toast]:bg-rose-950/20 dark:group-[.toast]:text-rose-200 dark:group-[.toast]:border-rose-800/30",
          info: "group-[.toast]:bg-blue-50/80 group-[.toast]:text-blue-900 group-[.toast]:border-blue-200 dark:group-[.toast]:bg-blue-950/20 dark:group-[.toast]:text-blue-200 dark:group-[.toast]:border-blue-800/30",
          warning: "group-[.toast]:bg-amber-50/80 group-[.toast]:text-amber-900 group-[.toast]:border-amber-200 dark:group-[.toast]:bg-amber-950/20 dark:group-[.toast]:text-amber-200 dark:group-[.toast]:border-amber-800/30",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
