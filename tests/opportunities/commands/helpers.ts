import { afterAll, beforeAll, beforeEach } from "vitest";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { OrganizationStatus } from "@/models/Organization";
import { UserRole } from "@/models/User";
import { clearTestDb, startTestDb, stopTestDb } from "../../helpers/db";
import {
  actorFor,
  createMemberOf,
  createOpportunityFixture,
  createOrganization,
  createUser,
} from "../../helpers/factories";

export function setupCommandTests() {
  beforeAll(startTestDb);
  afterAll(stopTestDb);
  beforeEach(clearTestDb);
}

export const validInput = {
  title: "Robotics Club Open Day",
  summary: "Come and meet the robotics club.",
  description: "A description that is comfortably longer than thirty characters.",
  category: "club",
  type: "in_person",
  applicationUrl: "https://example.com/apply",
};

export async function memberOf(status: OrganizationStatus = OrganizationStatus.ACTIVE) {
  const organization = await createOrganization({ status });
  const user = await createMemberOf(organization);
  return { organization, actor: await actorFor(user) };
}

export async function adminActor() {
  return actorFor(await createUser({ role: UserRole.ADMIN }));
}

export const draftIn = (organizationId: unknown, overrides = {}) =>
  createOpportunityFixture(organizationId as string, {
    status: OpportunityStatus.DRAFT,
    publishedAt: undefined,
    ...overrides,
  });
