import { describe, expect, it } from "vitest";
import { archiveOpportunity } from "@/features/opportunities/commands";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { listPublicOpportunities } from "@/features/opportunities/service";
import { Opportunity } from "@/models/Opportunity";
import { createOpportunityFixture } from "../../helpers/factories";
import { memberOf, setupCommandTests } from "./helpers";

setupCommandTests();

describe("archiveOpportunity", () => {
  it("archives without deleting and removes it from public listings", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await createOpportunityFixture(organization._id);
    expect((await listPublicOpportunities()).total).toBe(1);

    await archiveOpportunity(actor, opportunity.id);

    expect((await Opportunity.findById(opportunity._id))?.status).toBe(OpportunityStatus.ARCHIVED);
    expect((await listPublicOpportunities()).total).toBe(0);
  });

  it("stops one organization from archiving another's opportunity", async () => {
    const a = await memberOf();
    const b = await memberOf();
    const opportunity = await createOpportunityFixture(b.organization._id);

    await expect(archiveOpportunity(a.actor, opportunity.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect((await Opportunity.findById(opportunity._id))?.status).toBe(OpportunityStatus.PUBLISHED);
  });
});
