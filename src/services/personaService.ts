// services/personaService.ts — User search and membership resolution.
//
// Builds the complete UserContext for a given user by fetching their profile
// and transitive memberships (groups + directory roles).
// CRITICAL: Directory roles use roleTemplateId, NOT id.

import type { UserContext } from '../engine/models/SimulationContext';
import { graphFetch, fetchAllPages } from './graphClient';

// ── Types ───────────────────────────────────────────────────────────

export interface UserSearchResult {
  id: string;
  displayName: string;
  userPrincipalName: string;
  userType: string;
}

// ── 1. User Search ──────────────────────────────────────────────────

export async function searchUsers(token: string, query: string): Promise<UserSearchResult[]> {
  if (query.length < 2) return [];

  const escaped = query.replace(/'/g, "''");
  const filter = `startsWith(displayName,'${escaped}') or startsWith(userPrincipalName,'${escaped}')`;
  const select = 'id,displayName,userPrincipalName,userType';

  const result = await graphFetch<{ value: UserSearchResult[] }>(
    `/users?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=10`,
    token,
  );

  return result.value;
}

export async function fetchDefaultUsers(token: string): Promise<UserSearchResult[]> {
  const result = await graphFetch<{ value: UserSearchResult[] }>(
    `/users?$top=10&$orderby=displayName&$select=id,displayName,userPrincipalName,userType`,
    token,
  );
  return result.value;
}

// ── 2. Resolve User Context ─────────────────────────────────────────

export async function resolveUserContext(token: string, userId: string): Promise<UserContext> {
  // Fetch profile and transitive memberships in parallel
  const [profile, memberships] = await Promise.all([
    graphFetch<{
      id: string;
      displayName: string;
      userPrincipalName: string;
      userType: string | null;
    }>(`/users/${userId}?$select=id,displayName,userPrincipalName,userType`, token),

    fetchAllPages<{
      '@odata.type': string;
      id: string;
      displayName?: string;
      roleTemplateId?: string;
    }>(`/users/${userId}/transitiveMemberOf?$select=id,displayName,roleTemplateId&$top=999`, token),
  ]);

  // Separate groups and directory roles
  const groupIds: string[] = [];
  const roleTemplateIds: string[] = [];

  for (const obj of memberships) {
    const odataType = obj['@odata.type'] ?? '';

    if (odataType === '#microsoft.graph.group') {
      groupIds.push(obj.id);
    } else if (odataType === '#microsoft.graph.directoryRole') {
      // CRITICAL: Use roleTemplateId, NOT id.
      // The id field is the role assignment instance ID.
      // Policies reference roleTemplateId — the stable template GUID.
      if (obj.roleTemplateId) {
        roleTemplateIds.push(obj.roleTemplateId);
      } else {
        console.warn(
          `[PersonaService] directoryRole "${obj.displayName}" (id: ${obj.id}) is missing roleTemplateId — skipping`,
        );
      }
    }
    // Ignore administrativeUnit and other types
  }

  const isGuest = profile.userType?.toLowerCase() === 'guest';

  return {
    id: profile.id,
    displayName: profile.displayName,
    userType: isGuest ? 'guest' : 'member',
    memberOfGroupIds: groupIds,
    directoryRoleIds: roleTemplateIds,
    guestOrExternalUserTypes: isGuest ? ['b2bCollaborationGuest'] : undefined,
    homeTenantId: undefined,
  };
}
