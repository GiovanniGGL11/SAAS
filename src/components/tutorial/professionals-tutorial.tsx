import {
  Bullets,
  Faq,
  Fields,
  Path,
  Section,
  Steps,
  Tip,
  TutorialPage,
} from '@/components/tutorial/tutorial-kit';
import { ScheduleDemo } from '@/components/tutorial/demo/team-demos';

const SECTIONS = [
  { id: 'cadastro', label: 'Cadastrar' },
  { id: 'expediente', label: 'Expediente' },
  { id: 'ausencias', label: 'Ausências e bloqueios' },
  { id: 'comissao', label: 'Comissão e meta' },
  { id: 'acesso', label: 'Login próprio' },
  { id: 'duvidas', label: 'Dúvidas comuns' },
] as const;

export function ProfessionalsTutorial() {
  return (
    <TutorialPage
      title="Como usar Profissionais"
      description="Quem atende: horários de trabalho, folgas, comissão, meta e o login de cada um."
      backHref="/profissionais"
      backLabel="Voltar aos Profissionais"
      sections={SECTIONS}
    >
      <Section id="cadastro" title="Cadastrar um profissional">
        <Path items={['Profissionais', 'Novo profissional']} />
        <Fields
          rows={[
            ['Nome e cor', 'A cor identifica o profissional na agenda.'],
            [
              'Foto (opcional)',
              'Identifica o profissional nas listas. Quem tem login próprio pode trocar a foto pelo celular.',
            ],
            ['E-mail', 'Necessário para o login próprio do profissional (veja abaixo).'],
            ['Telefone (opcional)', 'Para mandar o convite de acesso pelo WhatsApp.'],
            ['Ativo', 'Desligue quando alguém sai da equipe: o histórico continua guardado.'],
          ]}
        />
        <Tip tone="warn">
          Cada plano tem um limite de profissionais ativos (Básico: 1; Profissional: até 4; Pro: 10
          incluídos, e acima disso R$ 10 por profissional). Quem passou do limite continua com a
          equipe que tem; só não dá para acrescentar.
        </Tip>
      </Section>

      <Section id="expediente" title="Expediente (horários de trabalho)">
        <p>
          Para cada dia da semana, os horários em que o profissional atende, com intervalos (Ex.:
          9h–12h e 13h–18h). As mudanças são salvas sozinhas.
        </p>
        <ScheduleDemo />
        <Bullets
          items={[
            'Fora do expediente, a agenda fica cinza e o link de agendamento não oferece horário.',
            <>
              Profissional novo: a tela sugere seg a sex, 9h às 18h, mas só vale depois de salvar
              (em <strong>Salvar este expediente</strong> ou mudando qualquer horário). Até lá, a
              lista mostra <strong>Sem expediente</strong> e ele não aparece no link.
            </>,
            'Um horário muito fora do comum (Ex.: 3h da manhã) pede confirmação, para evitar erro de digitação.',
          ]}
        />
      </Section>

      <Section id="ausencias" title="Ausências e bloqueios">
        <p>
          Férias, folga, curso, consulta médica: cadastre o período e o motivo. Nesses dias o
          profissional não aparece para agendamento, nem pela equipe nem pelo link.
        </p>
        <p>
          Para bloquear só algumas horas de um dia, também dá para usar{' '}
          <strong>Bloquear horário</strong> direto na agenda.
        </p>
      </Section>

      <Section id="comissao" title="Comissão e meta">
        <Fields
          rows={[
            [
              'Comissão',
              'Percentual (do que foi cobrado pelo serviço) ou valor fixo por atendimento. Um serviço com % própria vale no lugar desta regra.',
            ],
            [
              'Meta de faturamento no mês',
              'A produção esperada (Ex.: R$ 8.000). Ela aparece em Metas, com o ritmo do mês.',
            ],
          ]}
        />
        <p>
          O cartão de cada profissional mostra a produção e os atendimentos do mês e a participação
          no faturamento da equipe. O fechamento das comissões fica em Financeiro › Comissões.
        </p>
      </Section>

      <Section id="acesso" title="Login próprio do profissional">
        <p>
          Cada profissional pode ter o próprio login para acompanhar, do celular, a agenda dele, os
          clientes que ele atende e quanto ganhou.
        </p>
        <Steps
          items={[
            'Cadastre o e-mail do profissional.',
            <>
              Em <strong>Acesso do profissional</strong>, toque em <strong>Enviar convite</strong>.
              Ele recebe um e-mail para criar a senha.
            </>,
            <>
              Não chegou? Use <strong>Copiar link</strong> ou <strong>Enviar pelo WhatsApp</strong>{' '}
              para mandar o convite direto.
            </>,
            <>
              Quando ele entrar, aparece <strong>Tem acesso</strong>. Para tirar o acesso, use{' '}
              <strong>Remover acesso</strong> no mesmo lugar.
            </>,
          ]}
        />
        <Tip>
          Com o login próprio, o profissional vê só os horários e clientes dele, a meta dele e Meus
          ganhos. Financeiro, estoque, cadastros e configurações ficam com o dono.
        </Tip>
      </Section>

      <Section id="duvidas" title="Dúvidas comuns">
        <Faq
          items={[
            [
              'O profissional saiu. Apago?',
              'Desative (Inativo). Ele sai da agenda e do link, e os atendimentos e comissões antigos continuam no histórico.',
            ],
            [
              'Quem faz cada serviço?',
              'Isso fica no serviço: em Serviços, escolha "Escolher profissionais e preços" para dizer quem faz e por quanto.',
            ],
            [
              'O profissional pode marcar horários?',
              'Sim, na agenda dele. Ele não vê a agenda dos colegas.',
            ],
          ]}
        />
      </Section>
    </TutorialPage>
  );
}
