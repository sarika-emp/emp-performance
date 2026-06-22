import type { Knex } from "knex";

// A7: persist rating_variance on manager_effectiveness_scores so the manager
// detail breakdown can surface it (previously computed at calculation time but
// returned null in getManagerDetail).
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("manager_effectiveness_scores");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(
    "manager_effectiveness_scores",
    "rating_variance",
  );
  if (hasColumn) return;

  await knex.schema.alterTable("manager_effectiveness_scores", (t) => {
    t.decimal("rating_variance", 6, 2).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("manager_effectiveness_scores");
  if (!hasTable) return;
  const hasColumn = await knex.schema.hasColumn(
    "manager_effectiveness_scores",
    "rating_variance",
  );
  if (!hasColumn) return;
  await knex.schema.alterTable("manager_effectiveness_scores", (t) => {
    t.dropColumn("rating_variance");
  });
}
