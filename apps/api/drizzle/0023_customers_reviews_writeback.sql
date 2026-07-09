CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"wp_review_id" integer,
	"wp_product_id" integer,
	"product_name" text,
	"author" text,
	"author_email" text,
	"rating" integer DEFAULT 0 NOT NULL,
	"content" text,
	"status" text DEFAULT 'hold' NOT NULL,
	"wp_date_created" timestamp with time zone,
	"wp_version" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing" jsonb;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "shipping" jsonb;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "wp_version" text;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_reviews_store_wp_review_unique" ON "product_reviews" USING btree ("store_id","wp_review_id") WHERE "product_reviews"."wp_review_id" is not null;--> statement-breakpoint
CREATE INDEX "product_reviews_store_status_idx" ON "product_reviews" USING btree ("store_id","status");