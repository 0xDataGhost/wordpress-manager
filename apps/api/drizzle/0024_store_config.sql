CREATE TABLE "store_config_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"group" text NOT NULL,
	"data" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_config_snapshots" ADD CONSTRAINT "store_config_snapshots_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_config_snapshots_store_group_unique" ON "store_config_snapshots" USING btree ("store_id","group");--> statement-breakpoint
CREATE INDEX "store_config_snapshots_store_idx" ON "store_config_snapshots" USING btree ("store_id");