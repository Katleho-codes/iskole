'use client';

/**
 * Persistent signed-in shell.
 *
 * The shell is presentation only. It does not decide whether a route is protected: the API
 * does that on every request, and `(app)/layout.tsx` redirects when there is no session.
 * Keeping the navigation here means every page gets the same landmarks, focus order and
 * mobile reachability without repeating a header.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Compass,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/server-session';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

const topNav: NavItem = { href: '/dashboard', label: 'Home', icon: Home, exact: true };

const navGroups: NavGroup[] = [
  {
    label: 'Plan',
    items: [
      { href: '/profile', label: 'Profile', icon: UserRound },
      { href: '/marks', label: 'Marks', icon: ClipboardList },
      { href: '/match', label: 'Match', icon: Compass },
    ],
  },
  {
    label: 'Fund and apply',
    items: [
      { href: '/funding', label: 'Funding', icon: Wallet },
      { href: '/applications', label: 'Applications', icon: FileText },
      { href: '/offers', label: 'Offers', icon: GraduationCap },
    ],
  },
  {
    label: 'Study',
    items: [
      { href: '/study-plan', label: 'Study plan', icon: BookOpen },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/money', label: 'Money', icon: Banknote },
      { href: '/wellness', label: 'Wellness', icon: HeartPulse },
    ],
  },
  {
    label: 'Connect',
    items: [
      { href: '/communities', label: 'Communities', icon: Users },
      { href: '/messages', label: 'Messages', icon: MessageCircle },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/privacy', label: 'Privacy', icon: ShieldCheck },
      { href: '/moderation', label: 'Moderation', icon: ShieldCheck },
    ],
  },
];

const mobileNav: NavItem[] = [
  topNav,
  { href: '/match', label: 'Match', icon: Compass },
  { href: '/applications', label: 'Apply', icon: FileText },
  { href: '/calendar', label: 'Study', icon: CalendarDays },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'IS';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.assign('/signin');
  }

  return (
    <DropdownMenuItem
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault();
        void signOut();
      }}
      className="gap-2 text-destructive focus:text-destructive"
    >
      <LogOut className="size-4" />
      {pending ? 'Signing out…' : 'Sign out'}
    </DropdownMenuItem>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap className="size-5" aria-hidden="true" />
      </span>
      <span className="font-heading text-xl font-semibold tracking-tight text-navy-deep">iskole</span>
    </Link>
  );
}

function NavLink({ item, pathname, onNavigate, badge }: { item: NavItem; pathname: string; onNavigate?: () => void; badge?: number }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('size-[18px]', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {badge && badge > 0 ? (
        <Badge variant="danger" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
          {badge > 99 ? '99+' : badge}
        </Badge>
      ) : active ? <span className="ml-auto size-1.5 rounded-full bg-protea" aria-hidden="true" /> : null}
    </Link>
  );
}

function SidebarNav({ pathname, onNavigate, unreadCount }: { pathname: string; onNavigate?: () => void; unreadCount: number }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-4">
      <div className="space-y-1">
        <NavLink item={topNav} pathname={pathname} onNavigate={onNavigate} />
      </div>

      {navGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} badge={item.href === '/notifications' ? unreadCount : undefined} />
          ))}
        </div>
      ))}

      <div className="mt-auto rounded-[10px] border border-border bg-mist/70 p-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
          Demo account
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Seeded data makes the journey explorable. Your own account starts clean.
        </p>
      </div>
    </nav>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const displayName = user.name || 'Learner';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = (await res.json()) as { unread?: number };
          if (!cancelled && typeof data.unread === 'number') {
            setUnreadCount(data.unread);
          }
        }
      } catch {
        // ignore
      }
    }
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <SidebarNav pathname={pathname} unreadCount={unreadCount} />
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none">
                <Avatar className="size-9 border border-border">
                  <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                <span>{displayName}</span>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {user.role ?? 'STUDENT'}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="gap-2">
                  <UserRound className="size-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/privacy" className="gap-2">
                  <ShieldCheck className="size-4" />
                  Privacy and data
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <SignOutButton />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[290px] p-0">
                <SheetHeader className="border-b border-border px-5 py-4 text-left">
                  <SheetTitle asChild>
                    <Brand />
                  </SheetTitle>
                  <SheetDescription className="sr-only">Main navigation</SheetDescription>
                </SheetHeader>
                <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} unreadCount={unreadCount} />
                <div className="border-t border-border p-4">
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted"
                  >
                    <Avatar className="size-9 border border-border">
                      <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">
                        {initials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
            <Brand />
          </div>

          <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
            <span className="size-1.5 rounded-full bg-leaf" aria-hidden="true" />
            Your next step is waiting on Home
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden rounded-full sm:inline-flex">
              <Link href="/privacy">Privacy</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full focus-visible:outline-none"
                  aria-label="Open account menu"
                >
                  <Avatar className="size-9 border border-border">
                    <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">
                      {initials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="block truncate">{displayName}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="gap-2">
                    <UserRound className="size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/privacy" className="gap-2">
                    <ShieldCheck className="size-4" />
                    Privacy and data
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <SignOutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {mobileNav.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
