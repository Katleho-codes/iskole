"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

// The stored theme is only known in the browser. useSyncExternalStore gives a stable
// "not mounted" server snapshot (false) and a mounted client snapshot (true) without an
// effect that sets state after paint.
const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const mounted = React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full" aria-label="Toggle theme">
        <Sun className="size-4" />
      </Button>
    )
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme
  const isDark = currentTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
