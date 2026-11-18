import type { WorkspaceRole } from '@qualify/shared';

const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  member: 'Viewer',
};

export function roleLabel(role: WorkspaceRole): string {
  return roleLabels[role];
}

/** URL-safe, unique-enough slug: "Acme Solutions" → "acme-solutions-k3f9". */
export function workspaceSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace';
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** Owners and managers change settings; viewers only read (the API enforces the same). */
export function canManage(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}
