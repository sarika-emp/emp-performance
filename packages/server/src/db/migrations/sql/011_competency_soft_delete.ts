import type { Knex } from "knex";

// Batch 6 (Competencies):
//  - C4: stop hard-delete of a competency cascading away historical review
//    ratings (review_competency_ratings.competency_id is ON DELETE CASCADE).
//    Adds a deleted_at column to competencies so removal becomes a soft-delete:
//    the row (and its historical ratings) is preserved, the competency just
//    stops appearing in frameworks/lists.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("competencies")) {
    const hasDeletedAt = await knex.schema.hasColumn("competencies", "deleted_at");
    if (!hasDeletedAt) {
      await knex.schema.alterTable("competencies", (t) => {
        t.timestamp("deleted_at").nullable();
        t.index(["deleted_at"]);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("competencies")) {
    if (await knex.schema.hasColumn("competencies", "deleted_at")) {
      await knex.schema.alterTable("competencies", (t) => {
        t.dropColumn("deleted_at");
      });
    }
  }
}
