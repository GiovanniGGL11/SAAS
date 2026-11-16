-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "shareGoalsWithTeam" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "monthlyAppointmentsGoal" INTEGER;
