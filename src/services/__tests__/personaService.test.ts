// services/__tests__/personaService.test.ts — A real account as a UserContext.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUserContext } from '../personaService';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const GROUP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GLOBAL_READER_TEMPLATE = 'f2ef992c-3afb-46b9-b7cf-a126ee74c451';
const GLOBAL_READER_INSTANCE = '99999999-8888-7777-6666-555555555555';

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('resolveUserContext', () => {
  // The network boundary is mocked; our own logic never is.
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps role template ids for matching and role names for display', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url.includes('/transitiveMemberOf')
        ? respond({
            value: [
              { '@odata.type': '#microsoft.graph.group', id: GROUP_ID, displayName: 'Readers' },
              {
                '@odata.type': '#microsoft.graph.directoryRole',
                id: GLOBAL_READER_INSTANCE,
                displayName: 'Global Reader',
                roleTemplateId: GLOBAL_READER_TEMPLATE,
              },
            ],
          })
        : respond({ id: USER_ID, displayName: 'Reader', userPrincipalName: 'reader@example.com', userType: 'Member' }),
    );

    const user = await resolveUserContext('token', USER_ID);

    expect(user.memberOfGroupIds).toEqual([GROUP_ID]);
    // Policies store the template id, never the role instance id
    expect(user.directoryRoleIds).toEqual([GLOBAL_READER_TEMPLATE]);
    // A role no policy names still has a name to show
    expect(user.directoryRoleNames).toEqual({ [GLOBAL_READER_TEMPLATE]: 'Global Reader' });
  });
});
