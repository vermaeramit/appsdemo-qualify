import type { MeResponse, WorkspaceRole } from '@qualify/shared';

/** What decides what a user may see and change in the active workspace. */
type Access = Pick<NonNullable<MeResponse['activeWorkspace']>, 'role' | 'support'>;

const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  member: 'Viewer',
};

export function roleLabel(role: WorkspaceRole): string {
  return roleLabels[role];
}

/** The sidebar's role line ("Support view" for a platform admin's read-only visit). */
export function accessLabel(workspace: Access): string {
  return workspace.support ? 'Support view (read-only)' : roleLabel(workspace.role);
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

/** Sees what owners and managers see: every page and log (the support view included). */
export function seesManagerViews(workspace: Access): boolean {
  return workspace.role === 'owner' || workspace.role === 'admin';
}

/**
 * Owners and managers change settings; viewers and the support view (D-092) only read. The API
 * enforces the same.
 */
export function canManage(workspace: Access): boolean {
  return seesManagerViews(workspace) && !workspace.support;
}

/** Acts on leads (pause the AI): every member, never the read-only support view. */
export function canAct(workspace: Access): boolean {
  return !workspace.support;
}
