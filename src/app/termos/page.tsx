import type { Metadata } from 'next';
import Link from 'next/link';

import { H2, LegalPage, List } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Termos de uso · Atendafy',
  description: 'Condições de uso do Atendafy.',
};

export default function TermosPage() {
  return (
    <LegalPage title="Termos de uso" updated="15 de outubro de 2026">
      <p>
        Estes termos regem o uso do Atendafy, sistema on-line de gestão para negócios que trabalham
        com hora marcada (agenda, agendamento online, clientes, comanda, caixa, financeiro, estoque,
        fichas e comunicação com clientes). Ao criar uma conta ou usar o sistema, você concorda com
        eles.
      </p>

      <H2>1. Conta e acesso</H2>
      <List
        items={[
          'Quem cria a conta do estabelecimento é o administrador e responde pelas pessoas que convida para a equipe e pelos papéis que atribui.',
          'Mantenha suas credenciais em segurança. Atividades feitas com seu acesso são de sua responsabilidade.',
          'As informações cadastradas devem ser verdadeiras e mantidas atualizadas.',
        ]}
      />

      <H2>2. Dados dos seus clientes</H2>
      <List
        items={[
          <>
            O estabelecimento é o controlador dos dados dos próprios clientes e deve ter base legal
            para tratá-los, conforme a LGPD e a nossa{' '}
            <Link href="/privacidade" className="text-system-blue hover:underline">
              Política de privacidade
            </Link>
            .
          </>,
          'Mensagens automáticas e campanhas (WhatsApp, e-mail) só devem ser enviadas a clientes que esperam recebê-las. É proibido usar o sistema para spam ou para contatar quem pediu para não receber mensagens.',
          'Fichas com dados de saúde devem ser acessadas apenas por quem precisa delas para o atendimento.',
        ]}
      />

      <H2>3. Uso permitido</H2>
      <p>Não é permitido:</p>
      <List
        items={[
          'usar o sistema para atividades ilegais, fraudulentas ou que violem direitos de terceiros;',
          'tentar acessar dados de outros estabelecimentos, burlar limites de segurança ou sobrecarregar o serviço;',
          'copiar, revender ou fazer engenharia reversa do sistema.',
        ]}
      />

      <H2>4. Integrações de terceiros</H2>
      <p>
        Recursos como WhatsApp automático, Google Agenda e envio de e-mails dependem de serviços de
        terceiros, sujeitos aos termos desses fornecedores. O uso do WhatsApp segue as regras da
        plataforma, e o estabelecimento é responsável pelo número conectado e pelo conteúdo das
        mensagens.
      </p>

      <H2>5. Planos e pagamentos</H2>
      <p>
        Quando houver planos pagos, os valores, a forma de cobrança e as condições de cancelamento
        serão informados antes da contratação. A falta de pagamento pode levar à suspensão do
        acesso, preservados os dados pelo período informado.
      </p>

      <H2>6. Disponibilidade e suporte</H2>
      <p>
        Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para
        manutenção ou por falhas de terceiros. Recomendamos exportar periodicamente as informações
        importantes (por exemplo, a planilha do financeiro).
      </p>

      <H2>7. Responsabilidade</H2>
      <p>
        O Atendafy é uma ferramenta de gestão: as decisões do negócio, os preços, os atendimentos e
        as obrigações fiscais e trabalhistas são do estabelecimento. Na máxima extensão permitida
        pela lei, não respondemos por lucros cessantes ou danos indiretos decorrentes do uso do
        sistema.
      </p>

      <H2>8. Encerramento</H2>
      <p>
        Você pode deixar de usar o sistema a qualquer momento. Podemos suspender contas que violem
        estes termos. Ao encerrar, o estabelecimento pode solicitar a exportação e a exclusão dos
        dados, respeitados os prazos legais de guarda.
      </p>

      <H2>9. Alterações e lei aplicável</H2>
      <p>
        Estes termos podem ser atualizados, com aviso no sistema em caso de mudança relevante.
        Aplica-se a lei brasileira.
      </p>
    </LegalPage>
  );
}
