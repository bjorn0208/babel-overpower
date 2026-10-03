/**
 * Barrel export do módulo Wallpaper.
 * Tudo que o resto do app deve consumir sai daqui.
 */

export { Wallpaper } from "./Wallpaper";
export {
  WALLPAPERS,
  WALLPAPER_DEFAULT_ID,
  resolverWallpaper,
  aplicarPapelParedeNoDom,
  type WallpaperPreset,
} from "./wallpapers";
