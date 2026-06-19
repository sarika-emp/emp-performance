import type { Knex } from "knex";

// Batch 4 (one-on-ones):
//  - O4: promote the free-text one_on_one_meetings.action_items column to a real
//    structured `meeting_action_items` entity (assignee, due_date, status) with
//    carry-forward support across meetings.
//  - O7: add completion-audit columns (completed_at/completed_by) to meetings and
//    a completed_at column to agenda items so completion can be audited + reopened.
export async function up(knex: Knex): Promise<void> {
  // --- O7: meeting completion audit -----------------------------------------
  if (await knex.schema.hasTable("one_on_one_meetings")) {
    const hasCompletedAt = await knex.schema.hasColumn("one_on_one_meetings", "completed_at");
    const hasCompletedBy = await knex.schema.hasColumn("one_on_one_meetings", "completed_by");
    if (!hasCompletedAt || !hasCompletedBy) {
      await knex.schema.alterTable("one_on_one_meetings", (t) => {
        if (!hasCompletedAt) t.timestamp("completed_at").nullable();
        if (!hasCompletedBy) t.bigInteger("completed_by").unsigned().nullable();
      });
    }
  }

  // --- O7: agenda-item completion audit -------------------------------------
  if (await knex.schema.hasTable("meeting_agenda_items")) {
    const hasItemCompletedAt = await knex.schema.hasColumn("meeting_agenda_items", "completed_at");
    if (!hasItemCompletedAt) {
      await knex.schema.alterTable("meeting_agenda_items", (t) => {
        t.timestamp("completed_at").nullable();
      });
    }
  }

  // --- O4: structured action items ------------------------------------------
  if (!(await knex.schema.hasTable("meeting_action_items"))) {
    await knex.schema.createTable("meeting_action_items", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("meeting_id")
        .notNullable()
        .references("id")
        .inTable("one_on_one_meetings")
        .onDelete("CASCADE");
      t.string("description", 1000).notNullable();
      t.bigInteger("assignee_id").unsigned().nullable();
      t.date("due_date").nullable();
      t.string("status", 20).notNullable().defaultTo("open"); // open | in_progress | done | cancelled
      // When an item is carried forward into a later meeting, this points at the
      // original item so the chain can be traced.
      t.uuid("carried_from_id").nullable();
      t.bigInteger("created_by").unsigned().notNullable();
      t.timestamp("completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id"]);
      t.index(["meeting_id"]);
      t.index(["assignee_id"]);
      t.index(["status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("meeting_action_items");

  if (await knex.schema.hasTable("meeting_agenda_items")) {
    if (await knex.schema.hasColumn("meeting_agenda_items", "completed_at")) {
      await knex.schema.alterTable("meeting_agenda_items", (t) => t.dropColumn("completed_at"));
    }
  }

  if (await knex.schema.hasTable("one_on_one_meetings")) {
    const hasCompletedAt = await knex.schema.hasColumn("one_on_one_meetings", "completed_at");
    const hasCompletedBy = await knex.schema.hasColumn("one_on_one_meetings", "completed_by");
    if (hasCompletedAt || hasCompletedBy) {
      await knex.schema.alterTable("one_on_one_meetings", (t) => {
        if (hasCompletedAt) t.dropColumn("completed_at");
        if (hasCompletedBy) t.dropColumn("completed_by");
      });
    }
  }
}
