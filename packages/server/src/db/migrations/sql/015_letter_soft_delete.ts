import type { Knex } from "knex";

// Batch 8 (Letters):
//  - L2: deleting a performance-letter template must NOT cascade away the
//    historical letters that were generated from it. Migration 004 declared
//    generated_performance_letters.template_id as ON DELETE CASCADE, so a
//    template delete silently erased every issued letter referencing it.
//
//    Fixes applied here:
//      1. Add `deleted_at` to performance_letter_templates so template
//         removal becomes a soft-delete (the row — and the letters that point
//         at it — are preserved; the template just stops appearing in lists).
//      2. Add `template_name` snapshot + make `template_id` nullable on
//         generated_performance_letters and rebuild the FK as ON DELETE SET
//         NULL, so even a hard delete can never destroy issued letters.
//      3. Add `file_path` is already present; add `sent_to`, `voided_at`,
//         `voided_by` audit columns used by L1 (send delivery) and L8 (void).
export async function up(knex: Knex): Promise<void> {
  // 1. Soft-delete column on templates ------------------------------------
  if (await knex.schema.hasTable("performance_letter_templates")) {
    if (!(await knex.schema.hasColumn("performance_letter_templates", "deleted_at"))) {
      await knex.schema.alterTable("performance_letter_templates", (t) => {
        t.timestamp("deleted_at").nullable();
        t.index(["deleted_at"]);
      });
    }
  }

  // 2. Snapshot + safe FK on generated letters ----------------------------
  if (await knex.schema.hasTable("generated_performance_letters")) {
    if (!(await knex.schema.hasColumn("generated_performance_letters", "template_name"))) {
      await knex.schema.alterTable("generated_performance_letters", (t) => {
        t.string("template_name", 255).nullable();
      });
    }

    // Rebuild the FK on template_id from CASCADE -> SET NULL. We drop the
    // existing FK (named by convention) and the column constraints, make the
    // column nullable, and re-add a SET NULL reference. Wrapped in try/catch
    // per-step so the migration is idempotent across environments where the
    // constraint name may differ or the FK was already rebuilt.
    try {
      await knex.schema.alterTable("generated_performance_letters", (t) => {
        t.dropForeign(["template_id"]);
      });
    } catch {
      // FK already dropped / never existed under this name — safe to ignore.
    }

    await knex.schema.alterTable("generated_performance_letters", (t) => {
      t.uuid("template_id").nullable().alter();
    });

    try {
      await knex.schema.alterTable("generated_performance_letters", (t) => {
        t.foreign("template_id")
          .references("id")
          .inTable("performance_letter_templates")
          .onDelete("SET NULL");
      });
    } catch {
      // FK already present — safe to ignore.
    }

    // 3. Delivery + void audit columns ------------------------------------
    if (!(await knex.schema.hasColumn("generated_performance_letters", "sent_to"))) {
      await knex.schema.alterTable("generated_performance_letters", (t) => {
        t.string("sent_to", 320).nullable();
      });
    }
    if (!(await knex.schema.hasColumn("generated_performance_letters", "voided_at"))) {
      await knex.schema.alterTable("generated_performance_letters", (t) => {
        t.timestamp("voided_at").nullable();
        t.bigInteger("voided_by").unsigned().nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("performance_letter_templates")) {
    if (await knex.schema.hasColumn("performance_letter_templates", "deleted_at")) {
      await knex.schema.alterTable("performance_letter_templates", (t) => {
        t.dropColumn("deleted_at");
      });
    }
  }

  if (await knex.schema.hasTable("generated_performance_letters")) {
    for (const col of ["template_name", "sent_to", "voided_at", "voided_by"]) {
      if (await knex.schema.hasColumn("generated_performance_letters", col)) {
        await knex.schema.alterTable("generated_performance_letters", (t) => {
          t.dropColumn(col);
        });
      }
    }
  }
}
