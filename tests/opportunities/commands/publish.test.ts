import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { publishOpportunity } from "@/features/opportunities/commands";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { listPublicOpportunities } from "@/features/opportunities/service";
import { Opportunity } from "@/models/Opportunity";
import { OrganizationStatus } from "@/models/Organization";
import {
  createOpportunityFixture,
  daysFromNow,
} from "../../helpers/factories";
import { draftIn, memberOf, setupCommandTests } from "./helpers";

setupCommandTests();

describe("publishOpportunity", () => {
  it("publishes a valid draft and sets publishedAt", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await draftIn(organization._id, {
      slug: "going-live",
      deadline: daysFromNow(10),
    });

    const result = await publishOpportunity(actor, opportunity.id);

    expect(result.status).toBe(OpportunityStatus.PUBLISHED);
    expect((await Opportunity.findById(opportunity._id))?.publishedAt).toBeInstanceOf(Date);
    expect((await listPublicOpportunities()).total).toBe(1);
  });

  it.each([OrganizationStatus.PENDING, OrganizationStatus.SUSPENDED])(
    "is forbidden when the organization is %s",
    async (status) => {
      const { organization, actor } = await memberOf(status);
      const opportunity = await draftIn(organization._id);

      await expect(publishOpportunity(actor, opportunity.id)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect((await Opportunity.findById(opportunity._id))?.status).toBe(OpportunityStatus.DRAFT);
    },
  );

  it("stops one organization from publishing another's opportunity", async () => {
    const a = await memberOf();
    const b = await memberOf();
    const opportunity = await draftIn(b.organization._id);

    await expect(publishOpportunity(a.actor, opportunity.id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("refuses to publish an opportunity whose deadline has passed", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await draftIn(organization._id, { deadline: daysFromNow(-3) });

    await expect(publishOpportunity(actor, opportunity.id)).rejects.toBeInstanceOf(ZodError);
  });

  it("is idempotent for already-published opportunities", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await createOpportunityFixture(organization._id);
    const before = (await Opportunity.findById(opportunity._id))?.publishedAt;

    await publishOpportunity(actor, opportunity.id);
    expect((await Opportunity.findById(opportunity._id))?.publishedAt).toEqual(before);
  });
});
