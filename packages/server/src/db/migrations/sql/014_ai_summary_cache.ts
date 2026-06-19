import type { Knex } from "knex";

// A8: cache table for AI-generated performance summaries. Summaries are
// expensive (inline LLM call) and previously recomputed on every request with
// no persistence or audit trail. We store the serialized summary keyed by
// (scope, scope_key, cycle_id) and serve it unless ?regenerate=1 is passed.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("ai_summary_cache")) return;

  await knex.schema.createTable("ai_summary_cache", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    // scope: 'review' | 'employee' | 'team'
    t.string("scope", 20).notNullable();
    // scope_key: review id (uuid) or user/manager id (as string)
    t.string("scope_key", 64).notNullable();
    // cycle_id is null for review-scope summaries (the review pins its cycle)
    t.string("cycle_id", 64).nullable();
    t.string("model", 64).nullable();
    t.json("payload").notNullable();
    t.timestamp("generated_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "scope", "scope_key", "cycle_id"], "idx_ai_summary_lookup");
    t.unique(["organization_id", "scope", "scope_key", "cycle_id"], {
      indexName: "uq_ai_summary_cache_key",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_summary_cache");
}
