// Posição vertical do CommandBar nas transições (login desce, logoff sobe).
//
// O ciclo visual só fecha se login e logoff usarem a MESMA conta de posição e
// pararem EXATO onde o bar do desktop fica. No desktop o bar vive dentro do
// `.cmd-arena` (CSS `bottom: 24px`), com o `.cmd-shell` como último filho — ou
// seja, a borda de baixo do bar fica a 24px do fundo da tela.
//
// topCentro = meio da tela (estado inicial do login / final do logoff).
// topBase   = ponto em que a borda de baixo do bar cai nos 24px (== desktop),
//             calculado da altura REAL do bar (medida via ref) pra não depender
//             de número mágico que quebra se o CSS do bar mudar.
import { useLayoutEffect, useRef, useState } from "react";

// Espelha o `bottom` do `.cmd-arena` no desktop (bundle.css). Mudou lá? Muda aqui.
export const MARGEM_BASE_PX = 24;
// Altura do bar antes da 1ª medição (cmd-inner 66 + cmd-shell padding 6 = 72).
const ALTURA_BARRA_PADRAO = 72;

export function usePosicaoCommandBar() {
  const refBarra = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(ALTURA_BARRA_PADRAO);
  const [alturaJanela, setAlturaJanela] = useState(
    typeof window === "undefined" ? 800 : window.innerHeight,
  );

  useLayoutEffect(() => {
    const medir = () => {
      if (refBarra.current) setAltura(refBarra.current.offsetHeight);
      setAlturaJanela(window.innerHeight);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  const topCentro = alturaJanela / 2;
  const topBase = alturaJanela - MARGEM_BASE_PX - altura / 2;

  return { refBarra, topCentro, topBase };
}
