// Índice de nós — combina externo+ambos, interno e transversal
// Dados separados em 3 arquivos para respeitar limite de 300 linhas por arquivo

import type { NoMotorDados } from "./tipos";
import { NOS_EXTERNO } from "./grafo-nos-externo";
import { NOS_INTERNO } from "./grafo-nos-interno";
import { NOS_TRANSVERSAL } from "./grafo-nos-transversal";

export const NOS_MOTOR: NoMotorDados[] = [
  ...NOS_EXTERNO,
  ...NOS_INTERNO,
  ...NOS_TRANSVERSAL,
];
