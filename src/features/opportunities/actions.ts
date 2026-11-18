"use server";

import {
  requireOrganizationMember,
  requireUser,
} from "@/features/auth/permissions";
import {
  archiveOpportunity as archiveOpportunityCommand,
  createOpportunity as createOpportunityCommand,
} from "./commands";

export async function createOpportunity(organizationId: string, input: unknown) {
  const actor = await requireOrganizationMember(organizationId);
  return createOpportunityCommand(actor, organizationId, input);
}

export async function archiveOpportunity(id: string) {
  const actor = await requireUser();
  return archiveOpportunityCommand(actor, id);
}
