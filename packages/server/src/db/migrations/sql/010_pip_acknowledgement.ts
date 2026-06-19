import type { Knex } from "knex";

// Batch 5 (PIPs):
//  - P7: employee acknowledgement / sign-off. Adds acknowledgement columns to
//    performance_improvement_plans so an employee can formally sign off on the
//    plan (required for a defensible PIP process).
//  - P8: soft-delete support. Adds a deleted_at column so PIPs can be removed
//    without losing the audit trail (and excluded from lists/reads).
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("performance_improvement_plans")) {
    const hasAckAt = await knex.schema.hasColumn(
      "performance_improvement_plans",
      "acknowledged_at",
    );
    const hasAckBy = await knex.schema.hasColumn(
      "performance_improvement_plans",
      "acknowledged_by",
    );
    const hasAckNote = await knex.schema.hasColumn(
      "performance_improvement_plans",
      "acknowledgement_note",
    );
    const hasDeletedAt = await knex.schema.hasColumn(
      "performance_improvement_plans",
      "deleted_at",
    );

    if (!hasAckAt || !hasAckBy || !hasAckNote || !hasDeletedAt) {
      await knex.schema.alterTable("performance_improvement_plans", (t) => {
        if (!hasAckAt) t.timestamp("acknowledged_at").nullable();
        if (!hasAckBy) t.bigInteger("acknowledged_by").unsigned().nullable();
        if (!hasAckNote) t.text("acknowledgement_note").nullable();
        if (!hasDeletedAt) t.timestamp("deleted_at").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("performance_improvement_plans")) {
    const cols = [
      "acknowledged_at",
      "acknowledged_by",
      "acknowledgement_note",
      "deleted_at",
    ];
    const present: string[] = [];
    for (const c of cols) {
      if (await knex.schema.hasColumn("performance_improvement_plans", c)) {
        present.push(c);
      }
    }
    if (present.length > 0) {
      await knex.schema.alterTable("performance_improvement_plans", (t) => {
        present.forEach((c) => t.dropColumn(c));
      });
    }
  }
}
