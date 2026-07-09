CREATE TABLE "product_taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"wp_term_id" integer,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"parent_wp_id" integer,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_taxonomies" ADD CONSTRAINT "product_taxonomies_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_taxonomies_store_kind_term_unique" ON "product_taxonomies" USING btree ("store_id","kind","wp_term_id") WHERE "product_taxonomies"."wp_term_id" is not null;--> statement-breakpoint
CREATE INDEX "product_taxonomies_store_kind_idx" ON "product_taxonomies" USING btree ("store_id","kind");