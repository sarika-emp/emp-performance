import type { Knex } from "knex";

// Batch 6 (Succession):
//  - S1/S2/S4: succession plans gain a full update lifecycle (status,
//    criticality, department, title, current_holder) and candidates can be
//    edited/deleted. succession_candidates originally had no updated_at column,
//    so edits left no "last touched" timestamp. Add updated_at to candidates so
//    candidate edits (readiness/nine_box/notes) are timestamped consistently
//    with the rest of the schema.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("succession_candidates")) {
    const hasUpdatedAt = await knex.schema.hasColumn("succession_candidates", "updated_at");
    if (!hasUpdatedAt) {
      await knex.schema.alterTable("succession_candidates", (t) => {
        t.timestamp("updated_at").defaultTo(knex.fn.now());
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("succession_candidates")) {
    if (await knex.schema.hasColumn("succession_candidates", "updated_at")) {
      await knex.schema.alterTable("succession_candidates", (t) => {
        t.dropColumn("updated_at");
      });
    }
  }
}
