const QUESTIONS = [
  {
    q: 'Meus clientes conseguem agendar sozinhos?',
    a: 'Sim. Você liga o agendamento online em Configurações e divulga o seu link (na bio do Instagram, no WhatsApp). O cliente escolhe serviço, profissional e horário, e os horários respeitam o expediente e a agenda de cada profissional.',
  },
  {
    q: 'Dá para confirmar os horários pelo WhatsApp?',
    a: 'Sim. Em cada agendamento há um botão de WhatsApp com a mensagem pronta e um link para o cliente confirmar ou cancelar. A agenda atualiza sozinha quando ele responde.',
  },
  {
    q: 'Consigo trazer meus clientes de outro sistema?',
    a: 'Sim. Exporte a planilha do sistema antigo e importe em Clientes → Importar. Quem já estiver cadastrado com o mesmo telefone não é duplicado.',
  },
  {
    q: 'A equipe vê o financeiro?',
    a: 'Não. Financeiro, relatórios e configurações são só do dono e de quem você tornar administrador. A equipe usa a agenda e os clientes, e cada profissional pode abrir a agenda já na própria coluna.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Funciona no navegador do celular, do computador e do tablet, sem instalar nada.',
  },
];

/** Perguntas que todo dono de salão faz antes de trocar de sistema. */
export function Faq() {
  return (
    <section className="px-5 pb-24 md:pb-32">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-[34px] leading-[1.1] font-bold tracking-[-0.03em] md:text-[44px]">
          Perguntas frequentes
        </h2>
        <div className="mt-10 flex flex-col gap-3">
          {QUESTIONS.map((item) => (
            <details
              key={item.q}
              className="bg-tile group rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium">
                {item.q}
                <span className="text-label-secondary text-xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-label-secondary mt-3 text-[15px] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
