import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

export const alt = 'Atendafy — agenda cheia, caixa no controle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagem da prévia do link (WhatsApp, Instagram, Google). */
export default async function OpengraphImage() {
  const icon = await readFile(join(process.cwd(), 'src/app/icon.png'));
  const logo = `data:image/png;base64,${icon.toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: 'linear-gradient(135deg, #ffffff 0%, #eef5ff 60%, #d9e9ff 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontSize: 44,
          fontWeight: 700,
          color: '#1d1d1f',
        }}
      >
        <img src={logo} width={72} height={72} alt="" style={{ borderRadius: 18 }} />
        Atendafy
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1.02,
          color: '#1d1d1f',
        }}
      >
        Agenda cheia.
      </div>
      <div
        style={{
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1.02,
          color: '#007aff',
        }}
      >
        Caixa no controle.
      </div>
      <div style={{ marginTop: 36, fontSize: 32, color: '#515154' }}>
        Agendamento online, WhatsApp, comanda, caixa e financeiro para salões, barbearias e
        clínicas.
      </div>
    </div>,
    size,
  );
}
