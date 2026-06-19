import type { Knex } from "knex";

// Adds explicit decline-tracking columns to peer_review_nominations so a
// declined nomination no longer has to overload the approved_by column with the
// decliner's id (#R4). approved_by now exclusively means "approved by".
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("peer_review_nominations");
  if (!hasTable) return;

  const hasDeclinedBy = await knex.schema.hasColumn("peer_review_nominations", "declined_by");
  const hasDeclinedAt = await knex.schema.hasColumn("peer_review_nominations", "declined_at");

  await knex.schema.alterTable("peer_review_nominations", (t) => {
    if (!hasDeclinedBy) t.bigInteger("declined_by").unsigned().nullable();
    if (!hasDeclinedAt) t.timestamp("declined_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("peer_review_nominations");
  if (!hasTable) return;

  const hasDeclinedBy = await knex.schema.hasColumn("peer_review_nominations", "declined_by");
  const hasDeclinedAt = await knex.schema.hasColumn("peer_review_nominations", "declined_at");

  await knex.schema.alterTable("peer_review_nominations", (t) => {
    if (hasDeclinedBy) t.dropColumn("declined_by");
    if (hasDeclinedAt) t.dropColumn("declined_at");
  });
}
