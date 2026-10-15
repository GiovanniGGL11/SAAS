import { notFound, redirect } from 'next/navigation';

import { requireFormAccess } from '@/server/auth/form-access';
import { getTemplate } from '@/server/data/forms';
import { listAllServices } from '@/server/data/services';
import { UserError } from '@/server/errors';
import { TemplateEditor, type TemplateDraft } from '@/components/fichas/template-editor';
import { newId } from '@/lib/forms/schema';

export const metadata = { title: 'Modelo de ficha' };

/** Editor de modelo (`novo` cria um). Só quem gerencia modelos entra. */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company, access } = await requireFormAccess();
  if (!access.canManage) redirect('/fichas');

  const services = (await listAllServices(company.id)).map((s) => ({ id: s.id, name: s.name }));
  let initial: TemplateDraft;
  if (id === 'novo') {
    initial = {
      id: null,
      name: '',
      type: 'CUSTOM',
      description: '',
      instructions: '',
      fillableBy: 'BOTH',
      renewal: 'ONCE',
      renewalDays: null,
      requirement: 'NONE',
      serviceIds: [],
      schema: {
        sections: [
          {
            id: newId('s'),
            title: 'Perguntas',
            audience: 'any',
            questions: [{ id: newId('q'), type: 'short_text', title: '', required: false }],
          },
        ],
      },
      currentVersion: 0,
      archived: false,
    };
  } else {
    try {
      const t = await getTemplate(company.id, id.slice(0, 64));
      initial = {
        id: t.id,
        name: t.name,
        type: t.type,
        description: t.description ?? '',
        instructions: t.instructions ?? '',
        fillableBy: t.fillableBy,
        renewal: t.renewal,
        renewalDays: t.renewalDays,
        requirement: t.requirement,
        serviceIds: t.serviceIds,
        schema: t.schema,
        currentVersion: t.currentVersion,
        archived: t.status === 'ARCHIVED',
      };
    } catch (error) {
      if (error instanceof UserError) notFound();
      throw error;
    }
  }

  return <TemplateEditor key={initial.id ?? 'novo'} initial={initial} services={services} />;
}
