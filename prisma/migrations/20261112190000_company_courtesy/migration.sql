-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "courtesyNote" TEXT,
ADD COLUMN     "courtesyPlan" TEXT,
ADD COLUMN     "courtesyUntil" TIMESTAMP(3),
ADD COLUMN     "selfSignupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selfSignupFields" JSONB;
