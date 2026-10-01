export const WALLPAPERS = {
    aurora: 'radial-gradient(120% 80% at 10% 10%, #7f5af0 0%, transparent 55%), radial-gradient(90% 70% at 90% 30%, #2cb67d 0%, transparent 55%), radial-gradient(120% 90% at 50% 100%, #ff6ac1 0%, transparent 60%), #0b0b1a',
    sunset: 'radial-gradient(120% 90% at 20% 0%, #ffb86b 0%, transparent 60%), radial-gradient(100% 80% at 100% 60%, #ff5e8a 0%, transparent 60%), linear-gradient(180deg, #4b1d6b, #1d0b2e)',
    ocean: 'radial-gradient(110% 70% at 80% 0%, #4fd1ff 0%, transparent 55%), radial-gradient(120% 90% at 0% 100%, #2340a8 0%, transparent 60%), linear-gradient(180deg, #06223a, #020b16)',
    rose: 'radial-gradient(100% 70% at 30% 10%, #ffd1dc 0%, transparent 60%), radial-gradient(120% 90% at 100% 100%, #ff7aa2 0%, transparent 60%), linear-gradient(180deg, #ffb3c7, #b33a68)',
    mint: 'radial-gradient(100% 70% at 0% 0%, #b8ffdf 0%, transparent 60%), radial-gradient(120% 90% at 100% 100%, #00a7a0 0%, transparent 60%), linear-gradient(180deg, #4fd1b0, #0b5b63)',
    midnight: 'radial-gradient(80% 60% at 70% 20%, #3a2d7a 0%, transparent 60%), radial-gradient(100% 80% at 10% 90%, #12305e 0%, transparent 60%), #05050c',
    noir: 'linear-gradient(160deg, #1c1c1e 0%, #000 100%)',
};

export function wallpaperCss(s) {
    if (s.wallpaper === 'custom' && s.customWallpaper) {
        return `center / cover no-repeat url("${String(s.customWallpaper).replace(/["\\]/g, '')}")`;
    }
    return WALLPAPERS[s.wallpaper] ?? WALLPAPERS.aurora;
}
