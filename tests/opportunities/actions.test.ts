import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  archiveOpportunity,
  createOpportunity,
} from "@/features/opportunities/actions";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { listPublicOpportunities } from "@/features/opportunities/service";
import { Opportunity } from "@/models/Opportunity";
import { OrganizationStatus } from "@/models/Organization";
import { UserRole } from "@/models/User";
import { clearTestDb, startTestDb, stopTestDb } from "../helpers/db";
import {
  createMembership,
  createOpportunityFixture,
  createOrganization,
  createUser,
} from "../helpers/factories";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.getSession.mockResolvedValue(null);
});

const validInput = {
  title: "Robotics Club Open Day",
  summary: "Come and meet the robotics club.",
  description: "A description that is comfortably longer than thirty characters.",
  category: "club",
  type: "in_person",
  applicationUrl: "https://example.com/apply",
};

async function signInAs(authProviderId: string) {
  mocks.getSession.mockResolvedValue({ user: { id: authProviderId } });
}

async function signInAsMember(authProviderId: string, organizationId: string) {
  const user = await createUser({ authProviderId });
  await createMembership(user._id, organizationId);
  await signInAs(authProviderId);
}

async function createPublishedOpportunity(organizationId: string) {
  return createOpportunityFixture(organizationId, {
    title: "Robotics Club Open Day",
    slug: "robotics-club-open-day",
  });
}

describe("createOpportunity action", () => {
  it("rejects unauthenticated requests without saving an opportunity", async () => {
    const organization = await createOrganization();
    await expect(createOpportunity(organization.id, validInput)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(await Opportunity.countDocuments()).toBe(0);
  });

  it("rejects an authenticated user without an organization membership", async () => {
    const organization = await createOrganization();
    const authProviderId = "provider-admin";
    await createUser({ role: UserRole.ADMIN, authProviderId });
    await signInAs(authProviderId);

    await expect(createOpportunity(organization.id, validInput)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await Opportunity.countDocuments()).toBe(0);
  });

  it.each([OrganizationStatus.REJECTED, OrganizationStatus.SUSPENDED])(
    "rejects members of a %s organization",
    async (status) => {
      const organization = await createOrganization({ status });
      const authProviderId = "provider-member";
      await signInAsMember(authProviderId, organization.id);

      await expect(createOpportunity(organization.id, validInput)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await Opportunity.countDocuments()).toBe(0);
    },
  );

  it("publishes pending organizations' opportunities but hides them until approval", async () => {
    const organization = await createOrganization({ status: OrganizationStatus.PENDING });
    const authProviderId = "provider-member";
    await signInAsMember(authProviderId, organization.id);

    const result = await createOpportunity(organization.id, validInput);

    const stored = await Opportunity.findById(result.id);
    expect(stored?.status).toBe(OpportunityStatus.PUBLISHED);
    expect(stored?.publishedAt).toBeInstanceOf(Date);
    expect(stored?.organizationId.toString()).toBe(organization.id);
    expect(await Opportunity.countDocuments()).toBe(1);
    expect((await listPublicOpportunities()).total).toBe(0);

    await organization.updateOne({ status: OrganizationStatus.ACTIVE });
    expect((await listPublicOpportunities()).total).toBe(1);
  });

  it("creates an opportunity for the authenticated member's organization", async () => {
    const organization = await createOrganization();
    const otherOrganization = await createOrganization();
    const authProviderId = "provider-member";
    await signInAsMember(authProviderId, organization.id);

    const result = await createOpportunity(organization.id, {
      ...validInput,
      organizationId: otherOrganization.id,
      status: OpportunityStatus.PUBLISHED,
    });

    const stored = await Opportunity.findById(result.id);
    expect(stored?.organizationId.toString()).toBe(organization.id);
    expect(stored?.status).toBe(OpportunityStatus.PUBLISHED);
    expect(stored?.publishedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid data without saving an opportunity", async () => {
    const organization = await createOrganization();
    const authProviderId = "provider-member";
    await signInAsMember(authProviderId, organization.id);

    await expect(
      createOpportunity(organization.id, {
        ...validInput,
        applicationUrl: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await Opportunity.countDocuments()).toBe(0);
  });
});

describe("archiveOpportunity action", () => {
  it("archives a member's opportunity without deleting or changing its original data", async () => {
    const organization = await createOrganization();
    const authProviderId = "provider-member";
    const user = await createUser({ authProviderId });
    await createMembership(user._id, organization._id);
    await signInAs(authProviderId);
    const opportunity = await createPublishedOpportunity(organization.id);

    expect((await listPublicOpportunities()).total).toBe(1);
    const result = await archiveOpportunity(opportunity.id);

    const stored = await Opportunity.findById(opportunity.id);
    expect(result.status).toBe(OpportunityStatus.ARCHIVED);
    expect(await Opportunity.countDocuments()).toBe(1);
    expect(stored).toMatchObject({
      title: opportunity.title,
      summary: opportunity.summary,
      description: opportunity.description,
      applicationUrl: opportunity.applicationUrl,
      organizationId: organization._id,
      publishedAt: opportunity.publishedAt,
      status: OpportunityStatus.ARCHIVED,
    });
    expect((await listPublicOpportunities()).total).toBe(0);
  });

  it("allows platform admins to archive opportunities", async () => {
    const organization = await createOrganization();
    const authProviderId = "provider-admin";
    await createUser({ role: UserRole.ADMIN, authProviderId });
    await signInAs(authProviderId);
    const opportunity = await createPublishedOpportunity(organization.id);

    await expect(archiveOpportunity(opportunity.id)).resolves.toMatchObject({
      id: opportunity.id,
      status: OpportunityStatus.ARCHIVED,
    });
  });

  it("rejects unauthenticated and non-owning users without changing the opportunity", async () => {
    const organization = await createOrganization();
    const otherOrganization = await createOrganization();
    const opportunity = await createPublishedOpportunity(organization.id);

    await expect(archiveOpportunity(opportunity.id)).rejects.toMatchObject({
      code: "unauthenticated",
    });

    const authProviderId = "provider-stranger";
    const user = await createUser({ authProviderId });
    await createMembership(user._id, otherOrganization._id);
    await signInAs(authProviderId);
    await expect(archiveOpportunity(opportunity.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect((await Opportunity.findById(opportunity.id))?.status).toBe(
      OpportunityStatus.PUBLISHED,
    );
  });
});
