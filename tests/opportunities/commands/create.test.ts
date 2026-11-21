import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createOpportunity } from "@/features/opportunities/commands";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { listPublicOpportunities } from "@/features/opportunities/service";
import { Opportunity } from "@/models/Opportunity";
import { OrganizationStatus } from "@/models/Organization";
import {
  actorFor,
  createMemberOf,
  createOrganization,
} from "../../helpers/factories";
import { setupCommandTests, validInput, memberOf, adminActor } from "./helpers";

setupCommandTests();

describe("createOpportunity", () => {
  it("creates a published opportunity in the chosen organization with a generated slug", async () => {
    const { organization, actor } = await memberOf();

    const created = await createOpportunity(actor, organization.id, validInput);

    expect(created).toMatchObject({
      slug: "robotics-club-open-day",
      status: OpportunityStatus.PUBLISHED,
    });
    const stored = await Opportunity.findById(created.id);
    expect(stored?.organizationId.toString()).toBe(organization.id);
    expect(stored?.publishedAt).toBeInstanceOf(Date);
  });

  it("allows pending organizations to create opportunities that become visible after approval", async () => {
    const { organization, actor } = await memberOf(OrganizationStatus.PENDING);

    const created = await createOpportunity(actor, organization.id, validInput);

    expect(created.status).toBe(OpportunityStatus.PUBLISHED);
    expect((await listPublicOpportunities()).total).toBe(0);

    await organization.updateOne({ status: OrganizationStatus.ACTIVE });
    expect((await listPublicOpportunities()).total).toBe(1);
  });

  it("gives a second opportunity with the same title a different slug", async () => {
    const { organization, actor } = await memberOf();

    const first = await createOpportunity(actor, organization.id, validInput);
    const second = await createOpportunity(actor, organization.id, validInput);

    expect(second.slug).not.toBe(first.slug);
    expect(second.slug.startsWith("robotics-club-open-day-")).toBe(true);
  });

  it("lets a member of several organizations create in each of them", async () => {
    const [a, b] = [await createOrganization(), await createOrganization()];
    const actor = await actorFor(await createMemberOf(a, b));

    const inA = await createOpportunity(actor, a.id, validInput);
    const inB = await createOpportunity(actor, b.id, { ...validInput, title: "Second listing title" });

    expect((await Opportunity.findById(inA.id))?.organizationId.toString()).toBe(a.id);
    expect((await Opportunity.findById(inB.id))?.organizationId.toString()).toBe(b.id);
  });

  it("is forbidden for an organization the user does not belong to", async () => {
    const mine = await memberOf();
    const other = await createOrganization();

    await expect(createOpportunity(mine.actor, other.id, validInput)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await Opportunity.countDocuments({})).toBe(0);
  });

  it("is forbidden for a member acting for an unrelated organization, even with multiple memberships", async () => {
    const [a, b, c] = [await createOrganization(), await createOrganization(), await createOrganization()];
    const actor = await actorFor(await createMemberOf(a, b));

    await expect(createOpportunity(actor, c.id, validInput)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("ignores status and organizationId smuggled into the input", async () => {
    const { organization, actor } = await memberOf();
    const other = await createOrganization();

    const created = await createOpportunity(actor, organization.id, {
      ...validInput,
      status: "published",
      organizationId: other.id,
    });

    const stored = await Opportunity.findById(created.id);
    expect(stored?.status).toBe(OpportunityStatus.PUBLISHED);
    expect(stored?.publishedAt).toBeInstanceOf(Date);
    expect(stored?.organizationId.toString()).toBe(organization.id);
  });

  it.each([OrganizationStatus.SUSPENDED, OrganizationStatus.REJECTED])(
    "is forbidden when the organization is %s",
    async (status) => {
      const { organization, actor } = await memberOf(status);
      await expect(createOpportunity(actor, organization.id, validInput)).rejects.toMatchObject({
        code: "forbidden",
      });
    },
  );

  it("is forbidden for admins and users with no organizations", async () => {
    const organization = await createOrganization();

    await expect(createOpportunity(await adminActor(), organization.id, validInput)).rejects.toMatchObject({
      code: "forbidden",
    });
    const user = await createMemberOf();
    const actor = await actorFor(user);
    await expect(createOpportunity(actor, organization.id, validInput)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects invalid input", async () => {
    const { organization, actor } = await memberOf();
    await expect(
      createOpportunity(actor, organization.id, { ...validInput, applicationUrl: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
