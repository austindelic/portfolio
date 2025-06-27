CREATE TABLE "ProjectTechnology" (
	"projectId" uuid NOT NULL,
	"technologyId" uuid NOT NULL,
	CONSTRAINT "ProjectTechnology_projectId_technologyId_pk" PRIMARY KEY("projectId","technologyId")
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"url" text,
	"logoImage" text,
	"headerImage" text
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Technology" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"iconUrl" text,
	CONSTRAINT "Technology_name_unique" UNIQUE("name"),
	CONSTRAINT "Technology_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"githubId" integer NOT NULL,
	CONSTRAINT "User_username_unique" UNIQUE("username"),
	CONSTRAINT "User_email_unique" UNIQUE("email"),
	CONSTRAINT "User_githubId_unique" UNIQUE("githubId")
);
--> statement-breakpoint
CREATE INDEX "Session_userId_index" ON "Session" USING btree ("userId");