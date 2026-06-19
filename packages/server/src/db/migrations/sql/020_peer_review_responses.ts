import type { Knex } from "knex";

// Stores the actual peer-review submission a nominated reviewer fills out (#F9).
// Peer-review previously had nomination + approval but no place to record the
// review itself, even though the API docs advertised a submit endpoint. Each
// row is one reviewer's response to one approved nomination, scoped by org.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("peer_review_responses"))) {
    await knex.schema.createTable("peer_review_responses", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      // The approved nomination this response answers.
      t.uuid("nomination_id")
        .notNullable()
        .references("id")
        .inTable("peer_review_nominations")
        .onDelete("CASCADE");
      t.uuid("cycle_id")
        .notNullable()
        .references("id")
        .inTable("review_cycles")
        .onDelete("CASCADE");
      // empcloud user ids: the nominated peer (author) and the subject employee.
      t.bigInteger("reviewer_employee_id").unsigned().notNullable();
      t.bigInteger("reviewee_employee_id").unsigned().notNullable();
      // Structured per-competency ratings (JSON array of {competency_id, rating, comments?})
      // plus an overall rating and free-text commentary, mirroring the reviews table.
      t.decimal("overall_rating", 3, 1).nullable();
      t.json("ratings").nullable();
      t.text("strengths").nullable();
      t.text("improvements").nullable();
      t.text("comments").nullable();
      t.string("status", 20).notNullable().defaultTo("draft"); // draft | submitted
      t.timestamp("submitted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      // One response per nomination keeps submit idempotent at the DB level.
      t.unique(["nomination_id"]);
      t.index(["organization_id"]);
      t.index(["cycle_id"]);
      t.index(["reviewer_employee_id"]);
      t.index(["reviewee_employee_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("peer_review_responses");
}
