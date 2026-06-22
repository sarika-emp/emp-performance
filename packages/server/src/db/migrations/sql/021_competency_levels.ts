import type { Knex } from "knex";

// Batch 6 (Competencies):
//  - C6: build competency proficiency levels. The API docs advertised
//    POST /competencies/{id}/levels but no table/route/service existed.
//    Each row defines one proficiency level (e.g. 1=Beginner .. 5=Expert)
//    for a single competency, with behavioral anchors describing what that
//    level looks like in practice. Scoped by organization_id (the competency's
//    framework owns the org) for tenant isolation, FK to the competency.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("competency_levels"))) {
    await knex.schema.createTable("competency_levels", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("competency_id")
        .notNullable()
        .references("id")
        .inTable("competencies")
        .onDelete("CASCADE");
      // Numeric proficiency level, e.g. 1..5.
      t.integer("level").notNullable();
      // Human label for the level, e.g. "Beginner" / "Proficient" / "Expert".
      t.string("name", 200).notNullable();
      t.text("description").nullable();
      // JSON array of behavioral anchor strings — observable behaviours that
      // demonstrate this proficiency level.
      t.json("behavioral_anchors").nullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      // A competency cannot have two definitions for the same numeric level.
      t.unique(["competency_id", "level"]);
      t.index(["organization_id"]);
      t.index(["competency_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("competency_levels");
}
