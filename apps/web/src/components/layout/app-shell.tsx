import { useState, type ReactNode } from 'react';
import type { MeResponse } from '@qualify/shared';
import { Link } from '@tanstack/react-router';
import {
  FileInput,
  BookOpen,
  Bot,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  Webhook,
  ScrollText,
} from 'lucide-react';
import { ApiStatus } from '@/components/api-status';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SupportBanner } from '@/features/admin/support-banner';
import { accessLabel, initials, seesManagerViews } from '@/lib/workspace';
import { CommandPalette } from './command-palette';
import { UserMenu } from './user-menu';

type Workspace = NonNullable<MeResponse['activeWorkspace']>;

interface AppShellProps {
  user: MeResponse['user'];
  workspace: Workspace;
  children: ReactNode;
}

const navItemClass =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors';

const navLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/leads', label: 'Leads', icon: Users, exact: false },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare, exact: false },
  { to: '/meta-leads', label: 'Meta leads', icon: FileInput, exact: false },
  { to: '/agent', label: 'AI agents', icon: Bot, exact: false },
  { to: '/templates', label: 'Templates', icon: MessageSquareText, exact: false },
  { to: '/integrations', label: 'Integrations', icon: Webhook, exact: false, managerOnly: true },
  { to: '/costs', label: 'Costs', icon: Wallet, exact: false, managerOnly: true },
  { to: '/logs', label: 'Logs', icon: ScrollText, exact: false },
  { to: '/api-docs', label: 'API docs', icon: BookOpen, exact: false },
  { to: '/settings', label: 'Settings', icon: Settings, exact: false },
] as const;

export function AppShell({ user, workspace, children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandLogo />
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {navLinks
            .filter((link) => !('managerOnly' in link) || seesManagerViews(workspace))
            .map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                className={navItemClass}
                activeOptions={{ exact }}
                activeProps={{ className: 'bg-sidebar-accent text-sidebar-accent-foreground' }}
                inactiveProps={{
                  className:
                    'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                }}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          {user.isPlatformAdmin && (
            <Link
              to="/admin"
              className={navItemClass}
              activeProps={{ className: 'bg-sidebar-accent text-sidebar-accent-foreground' }}
              inactiveProps={{
                className:
                  'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              }}
            >
              <ShieldCheck className="size-4" />
              Platform admin
            </Link>
          )}
        </nav>
        <div className="m-2 flex items-center gap-2.5 rounded-lg border bg-card p-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
            {initials(workspace.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {workspace.name}
            </span>
            <span className="block text-xs text-muted-foreground">{accessLabel(workspace)}</span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-1 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {navLinks
                  .filter((link) => !('managerOnly' in link) || seesManagerViews(workspace))
                  .map(({ to, label, icon: Icon }) => (
                    <DropdownMenuItem key={to} asChild>
                      <Link to={to}>
                        <Icon />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <BrandLogo />
          </div>
          <Button
            variant="outline"
            className="hidden w-64 justify-start gap-2 text-muted-foreground md:inline-flex"
            onClick={() => setPaletteOpen(true)}
          >
            <Search data-icon="inline-start" />
            Search or jump to…
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[0.65rem]">
              Ctrl K
            </kbd>
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open command palette"
              onClick={() => setPaletteOpen(true)}
            >
              <Search />
            </Button>
            <ApiStatus />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <SupportBanner workspace={workspace} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
