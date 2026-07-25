"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Library,
  Plus,
  LogOut,
  ChevronDown,
  UsersRound,
  Map,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { invalidateCache } from "@/lib/data-cache";
import { getUserProfile } from "@/lib/users";
import { onAuthStateChanged } from "firebase/auth";

function ArigatoIcon({ className }: { className?: string }) {
  return (
    <img
      src="/arigato-single-logo.png"
      alt=""
      aria-hidden="true"
      className={cn("object-contain", className)}
    />
  );
}

const desktopNavLinks = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/videos", label: "Collection", shortLabel: "Collection", icon: Library },
  { href: "/guild", label: "Guild Videos", shortLabel: "Guild", icon: UsersRound },
  { href: "/roadmaps", label: "Mind Roadmaps", shortLabel: "Roadmaps", icon: Map },
  { href: "/videos/add", label: "Add Video", shortLabel: "Add", icon: Plus },
  { href: "/explore", label: "Arigato Labs", shortLabel: "Labs", icon: ArigatoIcon },
];

const mobileNavLinks = desktopNavLinks.filter(({ href }) => href !== "/explore");

function isPathActive(activePath: string, href: string) {
  return activePath === href || (href === "/roadmaps" && activePath.startsWith("/roadmaps/"));
}

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  // Initialize identically on server and client to avoid a hydration
  // mismatch, then sync the real path after mount.
  const [activePath, setActivePath] = useState("/");

  useEffect(() => {
    const syncPath = () => setActivePath(window.location.pathname);
    syncPath();
    // Since this component is persisted across Astro page transitions
    // (transition:persist), it won't remount on navigation — listen for
    // Astro's page-load event to keep the active link in sync (covers
    // back/forward navigation and links outside this component).
    document.addEventListener("astro:page-load", syncPath);
    return () => document.removeEventListener("astro:page-load", syncPath);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setUsername("");
        return;
      }
      try {
        const profile = await getUserProfile(u.uid);
        setUsername(profile?.username || "");
      } catch {
        setUsername("");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      invalidateCache();
      window.location.href = "/";
    } catch (err) {
      console.error(err);
    }
  };

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-20">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white border-b border-border" />

      <nav className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Logo */}
        <a
          href="/dashboard"
          className="flex items-center gap-2.5 font-display font-bold text-xl group"
        >
          <img
            src="/icons/icon-192.png"
            alt="SeenTube"
            className="h-9 w-9 rounded-lg object-contain transition-transform group-hover:scale-105"
          />
          <span className="gradient-text">SeenTube</span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          {desktopNavLinks.map(({ href, label, icon: Icon }) => {
            const isActive = isPathActive(activePath, href);
            return (
              <a
                key={href}
                href={href}
                onClick={() => setActivePath(href)}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors duration-150",
                  isActive
                    ? "text-foreground after:absolute after:left-3 after:right-3 after:-bottom-[26px] after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </a>
            );
          })}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-full border border-border p-1.5 hover:bg-secondary transition-colors group outline-none">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user.photoURL ?? ""} alt={user.displayName ?? ""} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
                    {user.displayName?.split(" ")[0]}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {username ? `@${username}` : user.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/settings">
                    <Settings className="h-4 w-4" />
                    Settings
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" asChild>
              <a href="/login">Sign in</a>
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}

export function BottomNav() {
  // Initialize identically on server and client to avoid a hydration
  // mismatch, then sync the real path after mount.
  const [activePath, setActivePath] = useState("/");

  useEffect(() => {
    const syncPath = () => setActivePath(window.location.pathname);
    syncPath();
    // Persisted across page transitions, so listen for Astro's page-load
    // event to keep the active tab in sync on every navigation.
    document.addEventListener("astro:page-load", syncPath);
    return () => document.removeEventListener("astro:page-load", syncPath);
  }, []);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white border-t border-border elevation-1">
      <div className="h-full grid grid-cols-5">
        {mobileNavLinks.map(({ href, shortLabel, icon: Icon }) => {
          const isActive = isPathActive(activePath, href);
          return (
            <a
              key={href}
              href={href}
              onClick={() => setActivePath(href)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
              {shortLabel}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
