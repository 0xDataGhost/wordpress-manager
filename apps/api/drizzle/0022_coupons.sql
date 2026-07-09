CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"wp_coupon_id" integer,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'fixed_cart' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"free_shipping" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"usage_limit_per_user" integer,
	"date_expires" timestamp with time zone,
	"restrictions" jsonb,
	"wp_version" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_store_wp_coupon_unique" ON "coupons" USING btree ("store_id","wp_coupon_id") WHERE "coupons"."wp_coupon_id" is not null;--> statement-breakpoint
CREATE INDEX "coupons_store_code_idx" ON "coupons" USING btree ("store_id","code");