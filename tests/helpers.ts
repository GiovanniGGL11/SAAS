import { prisma } from '@/lib/db';

/**
 * Every test run gets its own throwaway Company (unique clerkOrgId), so
 * tests can run against a real (dev/test) database without a shared fixture
 * — and tenant-isolation tests get two genuinely separate tenants for free.
 */
export async function createTestCompany(label: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const company = await prisma.company.create({
    data: {
      clerkOrgId: `test_org_${label}_${suffix}`,
      name: `Test Company ${label}`,
      slug: `test-company-${label}-${suffix}`,
    },
  });

  const professional = await prisma.professional.create({
    data: {
      companyId: company.id,
      name: `Professional ${label}`,
      color: '#0ea5e9',
    },
  });

  const service = await prisma.service.create({
    data: {
      companyId: company.id,
      name: `Service ${label}`,
      durationMinutes: 30,
      price: 50,
      color: '#22c55e',
    },
  });

  const client = await prisma.client.create({
    data: {
      companyId: company.id,
      name: `Client ${label}`,
      phone: `+1555${suffix.slice(0, 7)}`,
    },
  });

  return { company, professional, service, client };
}

export async function deleteTestCompany(companyId: string) {
  await prisma.googleCalendarConnection.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.taskComment.deleteMany({ where: { companyId } });
  await prisma.task.deleteMany({ where: { companyId } });
  await prisma.customFieldValue.deleteMany({ where: { companyId } });
  await prisma.customField.deleteMany({ where: { companyId } });
  await prisma.dailySummary.deleteMany({ where: { companyId } });
  await prisma.automationRun.deleteMany({ where: { companyId } });
  await prisma.importBatch.deleteMany({ where: { companyId } });
  await prisma.businessPreferences.deleteMany({ where: { companyId } });
  await prisma.quoteVersion.deleteMany({ where: { companyId } });
  await prisma.quote.deleteMany({ where: { companyId } });
  await prisma.opportunityEvent.deleteMany({ where: { companyId } });
  await prisma.opportunity.deleteMany({ where: { companyId } });
  await prisma.opportunityStage.deleteMany({ where: { companyId } });
  await prisma.waitlistOffer.deleteMany({ where: { companyId } });
  await prisma.aiActionProposal.deleteMany({ where: { companyId } });
  await prisma.aiTaskAuthorization.deleteMany({ where: { companyId } });
  await prisma.aiUsageEvent.deleteMany({ where: { companyId } });
  await prisma.aiUsageReservation.deleteMany({ where: { companyId } });
  await prisma.aiUsagePeriod.deleteMany({ where: { companyId } });
  await prisma.companyAddOn.deleteMany({ where: { companyId } });
  await prisma.loyaltyEntry.deleteMany({ where: { companyId } });
  await prisma.loyaltyProgram.deleteMany({ where: { companyId } });
  await prisma.transaction.deleteMany({ where: { companyId } });
  await prisma.recurringExpense.deleteMany({ where: { companyId } });
  await prisma.professionalAdvance.deleteMany({ where: { companyId } });
  await prisma.commissionPayout.deleteMany({ where: { companyId } });
  await prisma.cashSession.deleteMany({ where: { companyId } });
  await prisma.paymentMethodFee.deleteMany({ where: { companyId } });
  await prisma.financeCategory.deleteMany({ where: { companyId } });
  await prisma.appointmentProduct.deleteMany({ where: { appointment: { companyId } } });
  await prisma.serviceSupply.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.stockPurchase.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.waitlistEntry.deleteMany({ where: { companyId } });
  await prisma.review.deleteMany({ where: { companyId } });
  await prisma.whatsappMessage.deleteMany({ where: { companyId } });
  await prisma.campaign.deleteMany({ where: { companyId } });
  await prisma.formAccessToken.deleteMany({ where: { companyId } });
  await prisma.formEntryRevision.deleteMany({ where: { companyId } });
  await prisma.formEntry.deleteMany({ where: { companyId } });
  await prisma.formTemplateService.deleteMany({ where: { companyId } });
  await prisma.formTemplate.deleteMany({ where: { companyId } });
  await prisma.formPermission.deleteMany({ where: { companyId } });
  await prisma.sessionSignature.deleteMany({ where: { companyId } });
  await prisma.sessionRecord.deleteMany({ where: { companyId } });
  await prisma.packageMovement.deleteMany({ where: { companyId } });
  await prisma.appointment.deleteMany({ where: { companyId } });
  await prisma.clientPackage.deleteMany({ where: { companyId } });
  await prisma.packagePlan.deleteMany({ where: { companyId } });
  await prisma.giftCard.deleteMany({ where: { companyId } });
  await prisma.scheduleBlock.deleteMany({
    where: { professional: { companyId } },
  });
  await prisma.professionalAvailability.deleteMany({
    where: { professional: { companyId } },
  });
  await prisma.client.deleteMany({ where: { companyId } });
  await prisma.service.deleteMany({ where: { companyId } });
  await prisma.professional.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}
