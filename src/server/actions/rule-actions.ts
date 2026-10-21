'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import { assertTeamMember } from '@/server/team';
import { UserError } from '@/server/errors';
import { listRecentRuns } from '@/server/automations/runs';
import {
  RULE_ACTIONS,
  RULE_TRIGGERS,
  listRules,
  previewRule,
  runRule,
  saveRule,
  setRuleActive,
} from '@/server/automations/rules';

/* Automações configuráveis — Pro, só administradores. */

const id = z.string().min(1).max(64);
const ruleInput = z.object({
  id: id.optional(),
  name: z.string().max(80),
  trigger: z.enum(Object.keys(RULE_TRIGGERS) as [keyof typeof RULE_TRIGGERS]),
  days: z.number().int().min(0).max(90),
  action: z.enum(Object.keys(RULE_ACTIONS) as [keyof typeof RULE_ACTIONS]),
  assigneeUserId: z.string().max(64).nullish(),
  maxPerDay: z.number().int().min(1).max(50),
});

async function session() {
  const s = await requireCompanyAdmin();
  assertFeature(s.company, 'automationRules');
  return s;
}

export async function listRulesAction() {
  return toActionResult(async () => {
    const { company } = await session();
    const [rules, runs] = await Promise.all([
      listRules(company.id),
      listRecentRuns(company.id, 50),
    ]);
    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger,
      days: Number((r.conditions as { days?: number }).days ?? 0),
      action: r.action,
      assigneeUserId: r.assigneeUserId,
      maxPerDay: r.maxPerDay,
      active: r.active,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      runs: runs.filter((x) => x.routine === `rule:${r.id}`).slice(0, 5),
    }));
  });
}

export async function saveRuleAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = ruleInput.parse(input);
    const { company, userId } = await session();
    if (
      parsed.assigneeUserId &&
      !(await assertTeamMember(company.clerkOrgId, parsed.assigneeUserId))
    ) {
      throw new UserError('Responsável não faz parte da equipe.');
    }
    const rule = await saveRule(company.id, userId, parsed);
    return { id: rule.id };
  });
}

export async function previewRuleAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = ruleInput.pick({ id: true, trigger: true, days: true }).parse(input);
    const { company } = await session();
    return previewRule(company.id, parsed);
  });
}

export async function setRuleActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, active: z.boolean() }).parse(input);
    const { company, userId } = await session();
    await setRuleActive(company.id, userId, parsed.id, parsed.active);
  });
}

export async function runRuleNowAction(rawId: unknown) {
  return toActionResult(async () => {
    const ruleId = id.parse(rawId);
    const { company } = await session();
    return runRule(company.id, ruleId, 'manual');
  });
}
