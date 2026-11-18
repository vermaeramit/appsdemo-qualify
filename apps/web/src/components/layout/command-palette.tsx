import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Webhook,
  Users,
  FileInput,
  BookOpen,
  Bot,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Moon,
  Settings,
  Sun,
  Wallet,
} from 'lucide-react';
import { useTheme } from '@/components/theme/use-theme';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useSignOut } from '@/features/auth/use-sign-out';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ctrl+K / ⌘K palette. Grows with each milestone (leads, playbooks, settings…). */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const run = (action: () => void | Promise<void>) => {
    onOpenChange(false);
    void action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => run(() => navigate({ to: '/' }))}>
              <LayoutDashboard />
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/leads' }))}>
              <Users />
              Leads (filters, Excel export)
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/conversations' }))}>
              <MessagesSquare />
              Conversations
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/meta-leads' }))}>
              <FileInput />
              Meta leads (lead form submissions)
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/agent' }))}>
              <Bot />
              AI agent (questions, opening, knowledge base)
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/integrations' }))}>
              <Webhook />
              Integrations (webhooks)
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/costs' }))}>
              <Wallet />
              Costs (Meta and AI)
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/api-docs' }))}>
              <BookOpen />
              API docs
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate({ to: '/settings' }))}>
              <Settings />
              Settings (API keys)
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
            >
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} mode
            </CommandItem>
            <CommandItem onSelect={() => run(signOut)}>
              <LogOut />
              Sign out
              <CommandShortcut>Account</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
