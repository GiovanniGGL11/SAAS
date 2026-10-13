import { describe, expect, it } from 'vitest';

import { parseCsv, rowsToClients } from '@/lib/csv';

describe('importação de clientes por planilha', () => {
  it('lê o CSV do Excel em português (;), com aspas e acento nos títulos', () => {
    const csv =
      '﻿Nome Completo;Celular;E-mail;Data de Nascimento\n"Silva; Maria";(11) 98888-7777;m@x.com;05/03/1990\nJoão;;;\n';
    const { clients, missingName } = rowsToClients(parseCsv(csv));
    expect(missingName).toBe(false);
    expect(clients).toEqual([
      {
        name: 'Silva; Maria',
        phone: '(11) 98888-7777',
        email: 'm@x.com',
        cpf: undefined,
        birthDate: '1990-03-05',
      },
      { name: 'João', phone: undefined, email: undefined, cpf: undefined, birthDate: undefined },
    ]);
  });

  it('lê as colunas de endereço sem confundir número com nome', () => {
    const csv =
      'Nome;CEP;Endereço;Número;Complemento;Bairro;Cidade;UF\nAna;01310-100;Av. Paulista;1000;Sala 1;Bela Vista;São Paulo;SP\n';
    const { clients } = rowsToClients(parseCsv(csv));
    expect(clients[0]).toMatchObject({
      name: 'Ana',
      zipCode: '01310-100',
      street: 'Av. Paulista',
      number: '1000',
      complement: 'Sala 1',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('avisa quando não há coluna de nome', () => {
    expect(rowsToClients(parseCsv('telefone,email\n119,a@b.c')).missingName).toBe(true);
  });
});
