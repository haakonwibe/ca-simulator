// data/samplePersonas.ts — Hardcoded sample personas for demo mode.

import type { UserContext } from '../engine/models/SimulationContext';

export const SAMPLE_PERSONAS: UserContext[] = [
  {
    id: 'sample-user-1',
    displayName: 'Alex Johnson',
    userType: 'member',
    memberOfGroupIds: ['group-all-employees', 'group-marketing'],
    directoryRoleIds: [],
  },
  {
    id: 'sample-user-2',
    displayName: 'Sam Chen',
    userType: 'member',
    memberOfGroupIds: ['group-all-employees', 'group-it'],
    directoryRoleIds: [
      '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
      '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
    ],
  },
  {
    id: 'sample-user-3',
    displayName: 'Jordan Guest',
    userType: 'guest',
    memberOfGroupIds: [],
    directoryRoleIds: [],
    guestOrExternalUserTypes: ['b2bCollaborationGuest'],
  },
  {
    id: 'break-glass-admin',
    displayName: 'Break Glass Account',
    userType: 'member',
    memberOfGroupIds: ['group-breakglass'],
    directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'],
  },
  {
    id: 'sample-user-5',
    displayName: 'Riley Service',
    userType: 'member',
    memberOfGroupIds: ['group-service-accounts'],
    directoryRoleIds: [],
  },
];
