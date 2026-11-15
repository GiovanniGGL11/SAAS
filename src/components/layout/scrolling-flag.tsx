'use client';

import * as React from 'react';

/**
 * Marca o <html> com `data-scrolling` enquanto a página rola (e até 150 ms depois de parar).
 * O CSS usa isso para desligar o destaque dos blocos ao passar o mouse durante a rolagem.
 */
export function ScrollingFlag() {
  React.useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      // Só escreve no início da rolagem (escrever a cada evento faria o navegador recalcular estilos).
      if (!('scrolling' in root.dataset)) root.dataset.scrolling = '1';
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete root.dataset.scrolling;
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      delete root.dataset.scrolling;
    };
  }, []);
  return null;
}
