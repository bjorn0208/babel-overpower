/**
 * Stub do `@iwer/sem` (emulador sintético de headset do @pmndrs/xr).
 * Só é usado em modo de emulação dev (`?emulate`); o pacote real puxa
 * `@bufbuild/protobuf@2` que conflita com o v1 do livekit no bundle.
 * Aqui: classe vazia com a MESMA interface superficial — nunca instanciada
 * em produção.
 */
export class SyntheticEnvironmentModule {
  loadEnvironment(): void {
    console.warn("[maquete-3d] emulador @iwer/sem desativado no bundle");
  }
  loadDefaultEnvironment(): void {
    console.warn("[maquete-3d] emulador @iwer/sem desativado no bundle");
  }
}
