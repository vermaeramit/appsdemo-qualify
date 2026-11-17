import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ApiStatus } from '@/components/api-status';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Leads', icon: Users },
  { label: 'Playbooks', icon: Workflow },
  { label: 'Templates', icon: MessageSquareText },
  { label: 'Integrations', icon: Webhook },
  { label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandLogo />
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {navItems.map((item) => (
            <SidebarItem key={item.label} item={item} />
          ))}
        </nav>
        <div className="m-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Milestone M0</div>
          Design system preview
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="md:hidden">
            <BrandLogo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ApiStatus />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const content = (
    <button
      type="button"
      aria-current={item.active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
        item.active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </button>
  );

  if (item.active) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">Coming in a later milestone</TooltipContent>
    </Tooltip>
  );
}
