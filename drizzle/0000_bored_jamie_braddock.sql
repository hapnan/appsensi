CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"room_code" text NOT NULL,
	"session_date" date NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"has_classes" boolean DEFAULT true NOT NULL,
	"total_floors" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"building_code" text NOT NULL,
	"floor" integer NOT NULL,
	"room_number" text NOT NULL,
	"name" text,
	"capacity" integer
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_code_buildings_code_fk" FOREIGN KEY ("building_code") REFERENCES "public"."buildings"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_student_room_day_idx" ON "attendance" USING btree ("student_id","room_code","session_date");--> statement-breakpoint
CREATE INDEX "attendance_room_day_idx" ON "attendance" USING btree ("room_code","session_date");--> statement-breakpoint
CREATE INDEX "rooms_building_idx" ON "rooms" USING btree ("building_code");