import { describe, expect, it } from "vitest";
import { updateOpportunity } from "@/features/opportunities/commands";
import { OpportunityStatus } from "@/features/opportunities/constants";
import { Opportunity } from "@/models/Opportunity";
import {
  actorFor,
  createMemberOf,
  createOrganization,
} from "../../helpers/factories";
import { draftIn, memberOf, adminActor, setupCommandTests } from "./helpers";

setupCommandTests();

describe("updateOpportunity", () => {
  it("lets a member edit their own opportunity without changing the slug", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await draftIn(organization._id, { slug: "stable-slug" });

    await updateOpportunity(actor, opportunity.id, { title: "A brand new title" });

    const stored = await Opportunity.findById(opportunity._id);
    expect(stored?.title).toBe("A brand new title");
    expect(stored?.slug).toBe("stable-slug");
  });

  it("stops one organization from editing another's opportunity", async () => {
    const a = await memberOf();
    const b = await memberOf();
    const opportunity = await draftIn(b.organization._id, { title: "Original title" });

    await expect(
      updateOpportunity(a.actor, opportunity.id, { title: "Hijacked title" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect((await Opportunity.findById(opportunity._id))?.title).toBe("Original title");
  });

  it("lets a member of two organizations edit opportunities in both, but not a third", async () => {
    const [a, b, c] = [await createOrganization(), await createOrganization(), await createOrganization()];
    const actor = await actorFor(await createMemberOf(a, b));
    const inA = await draftIn(a._id);
    const inB = await draftIn(b._id);
    const inC = await draftIn(c._id, { title: "Original title" });

    await updateOpportunity(actor, inA.id, { title: "Edited in A" });
    await updateOpportunity(actor, inB.id, { title: "Edited in B" });
    await expect(updateOpportunity(actor, inC.id, { title: "Hijacked title" })).rejects.toMatchObject({
      code: "forbidden",
    });

    expect((await Opportunity.findById(inA._id))?.title).toBe("Edited in A");
    expect((await Opportunity.findById(inB._id))?.title).toBe("Edited in B");
    expect((await Opportunity.findById(inC._id))?.title).toBe("Original title");
  });

  it("lets any member of the same organization edit its opportunities", async () => {
    const { organization } = await memberOf();
    const first = await actorFor(await createMemberOf(organization));
    const second = await actorFor(await createMemberOf(organization));
    const opportunity = await draftIn(organization._id);

    await updateOpportunity(first, opportunity.id, { title: "Edited by first" });
    await updateOpportunity(second, opportunity.id, { title: "Edited by second" });

    expect((await Opportunity.findById(opportunity._id))?.title).toBe("Edited by second");
  });

  it("lets an admin edit any opportunity", async () => {
    const { organization } = await memberOf();
    const opportunity = await draftIn(organization._id);

    await updateOpportunity(await adminActor(), opportunity.id, { title: "Edited by admin" });
    expect((await Opportunity.findById(opportunity._id))?.title).toBe("Edited by admin");
  });

  it("cannot change status through update input", async () => {
    const { organization, actor } = await memberOf();
    const opportunity = await draftIn(organization._id);

    await updateOpportunity(actor, opportunity.id, { status: "published" });
    expect((await Opportunity.findById(opportunity._id))?.status).toBe(OpportunityStatus.DRAFT);
  });

  it("reports not_found for unknown or malformed ids", async () => {
    const { actor } = await memberOf();
    await expect(updateOpportunity(actor, "not-an-id", {})).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateOpportunity(actor, "64b7f0f2f0f0f0f0f0f0f0f0", {})).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
