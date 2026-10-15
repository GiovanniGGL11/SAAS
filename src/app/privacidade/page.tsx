import type { Metadata } from 'next';

import { H2, LegalPage, List } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Política de privacidade · Atendafy',
  description: 'Como o Atendafy trata dados pessoais, de acordo com a LGPD.',
};

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de privacidade" updated="15 de outubro de 2026">
      <p>
        Esta política explica como o Atendafy trata dados pessoais, nos termos da Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018 — LGPD). Ela vale para quem usa o sistema (donos e
        equipes dos estabelecimentos) e para os clientes desses estabelecimentos que agendam,
        confirmam horários, preenchem fichas ou avaliam atendimentos.
      </p>

      <H2>1. Papéis de cada um</H2>
      <List
        items={[
          <>
            <strong>Dados da conta</strong> (nome, e-mail e dados de acesso de quem usa o sistema):
            o Atendafy é o <strong>controlador</strong>.
          </>,
          <>
            <strong>Dados dos clientes do estabelecimento</strong> (cadastro, agenda, histórico,
            fichas, pagamentos): o estabelecimento é o <strong>controlador</strong> e decide para
            que usa esses dados; o Atendafy é o <strong>operador</strong> e trata esses dados apenas
            para prestar o serviço, conforme as instruções do estabelecimento.
          </>,
        ]}
      />

      <H2>2. Quais dados tratamos</H2>
      <List
        items={[
          'Conta: nome, e-mail, foto (opcional), organização e papel na equipe.',
          'Clientes do estabelecimento: nome, telefone, e-mail, CPF, data de nascimento e endereço (quando informados), agendamentos, atendimentos, pagamentos, pacotes, créditos, avaliações e mensagens enviadas.',
          'Fichas e anamneses: respostas preenchidas pelo cliente ou pela equipe, que podem incluir dados de saúde (dado pessoal sensível). Esses dados ficam restritos a quem o estabelecimento autorizar.',
          'Dados técnicos: registros de acesso e de alterações (histórico), necessários para segurança e auditoria.',
        ]}
      />
      <p>
        O Atendafy não armazena números de cartão. Pagamentos registrados no sistema são lançamentos
        informados pelo estabelecimento.
      </p>

      <H2>3. Para que usamos</H2>
      <List
        items={[
          'Prestar o serviço: agenda, agendamento online, lembretes e confirmações, comanda, caixa, financeiro, relatórios e fichas.',
          'Enviar as mensagens que o estabelecimento configurar (confirmação, lembrete, avaliação, aniversário e campanhas).',
          'Segurança, prevenção a fraudes, suporte e cumprimento de obrigações legais.',
        ]}
      />
      <p>
        As bases legais são a execução de contrato, o legítimo interesse, o cumprimento de obrigação
        legal e, para dados de saúde em fichas, a tutela da saúde ou o consentimento do titular,
        conforme o caso — cabendo ao estabelecimento, como controlador, garantir a base adequada
        para os dados dos seus clientes.
      </p>

      <H2>4. Com quem compartilhamos</H2>
      <p>Usamos fornecedores que tratam dados em nosso nome, apenas para operar o serviço:</p>
      <List
        items={[
          'Clerk — login e gestão de contas.',
          'Supabase (Amazon Web Services) — banco de dados.',
          'Vercel — hospedagem da aplicação.',
          'Google — Google Agenda, quando o estabelecimento conecta, e assistente com IA, quando usado.',
          'Resend — envio de e-mails, quando configurado.',
          'Z-API — envio de mensagens pelo WhatsApp do próprio estabelecimento, quando configurado.',
        ]}
      />
      <p>
        Alguns desses fornecedores armazenam dados fora do Brasil. Nesses casos, a transferência
        internacional segue o art. 33 da LGPD, com fornecedores que adotam padrões de proteção
        compatíveis. Não vendemos dados pessoais.
      </p>

      <H2>5. Segurança</H2>
      <List
        items={[
          'Conexões criptografadas (HTTPS) e credenciais de integrações guardadas cifradas.',
          'Cada estabelecimento só acessa os próprios dados; dentro dele, papéis separam o que a equipe e o administrador veem.',
          'Fichas com permissões por pessoa e histórico de acesso e de alterações.',
          'Links enviados a clientes (confirmação, avaliação, fichas) são assinados e não dão acesso ao restante do sistema.',
        ]}
      />

      <H2>6. Por quanto tempo guardamos</H2>
      <p>
        Enquanto a conta do estabelecimento estiver ativa e, depois, pelo tempo necessário para
        cumprir obrigações legais (por exemplo, fiscais) ou resolver disputas. O estabelecimento
        pode pedir a exclusão dos dados ao encerrar o uso.
      </p>

      <H2>7. Seus direitos</H2>
      <p>
        O titular pode pedir confirmação de tratamento, acesso, correção, anonimização,
        portabilidade, exclusão, informação sobre compartilhamento e revogação de consentimento
        (art. 18 da LGPD).
      </p>
      <List
        items={[
          'Se você é cliente de um estabelecimento, faça o pedido diretamente a ele — ele é o controlador dos seus dados e pode atendê-lo pelo próprio sistema.',
          'Se você usa o sistema (dono ou equipe), fale com o Atendafy pelos canais de atendimento indicados no site.',
        ]}
      />

      <H2>8. Cookies</H2>
      <p>
        Usamos apenas cookies e armazenamento local necessários para manter você conectado e lembrar
        preferências (como o tema claro ou escuro). Não usamos cookies de publicidade.
      </p>

      <H2>9. Mudanças</H2>
      <p>
        Esta política pode ser atualizada. Mudanças relevantes serão avisadas no sistema. A data no
        topo indica a versão vigente.
      </p>
    </LegalPage>
  );
}
