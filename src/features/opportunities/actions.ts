"use server";

import {
  requireOrganizationMember,
  requireUser,
} from "@/features/auth/permissions";
import {
  archiveOpportunity as archiveOpportunityCommand,
  createOpportunity as createOpportunityCommand,
  publishOpportunity as publishOpportunityCommand,
  updateOpportunity as updateOpportunityCommand,
} from "./commands";

export async function createOpportunity(organizationId: string, input: unknown) {
  const actor = await requireOrganizationMember(organizationId);
  return createOpportunityCommand(actor, organizationId, input);
}

export async function archiveOpportunity(id: string) {
  const actor = await requireUser();
  return archiveOpportunityCommand(actor, id);
}

export async function updateOpportunity(id: string, input: unknown) {
  const actor = await requireUser();
  return updateOpportunityCommand(actor, id, input);
}

export async function publishOpportunity(id: string) {
  const actor = await requireUser();
  return publishOpportunityCommand(actor, id);
}
