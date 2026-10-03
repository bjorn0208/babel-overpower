import { useEffect } from "react";

// App fantasma "Reino": atalho dentro da Babel que leva à página separada /reino.
// Ao ser aberto como janela, redireciona em navegação plena para a rota dedicada.
export default function ReinoFantasma() {
  useEffect(() => {
    window.location.href = "/reino";
  }, []);
  return null;
}
