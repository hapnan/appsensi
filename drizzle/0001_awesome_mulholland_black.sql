ALTER TABLE "students" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "studentId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_studentId_unique" UNIQUE("studentId");