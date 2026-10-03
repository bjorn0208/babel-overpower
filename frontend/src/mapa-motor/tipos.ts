// Tipos do grafo do motor vivo
// C3: adicionado ModoVista para toggle Grafo / Lab

export type CanalNo = "externo" | "interno" | "ambos";

export type FiltroCanal = "todos" | "externo" | "interno";

export interface NoMotorDados {
  id: string;
  label: string;
  canal: CanalNo;
  faz: string;
  ativa_proximo: string;
  fonte_dado_real: string;
  ref: string;
}

export interface ArestaMotorDados {
  from: string;
  to: string;
  label: string;
}

export interface GrafoMotorMeta {
  gerado_em: string;
  fonte: string;
  modelos: Record<string, string>;
}

export interface GrafoMotor {
  meta: GrafoMotorMeta;
  nodes: NoMotorDados[];
  edges: ArestaMotorDados[];
}

/** Vista ativa na tela: grafo do motor · construção da mensagem (cérebro) · lista do lab (gap) */
export type ModoVista = "grafo" | "construcao" | "lab";
