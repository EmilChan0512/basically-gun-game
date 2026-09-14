import type { GrowthGadgetId } from '../../shared/content/growth-v3/Gadgets';
import type { GROWTH_V3_ULTIMATES } from '../../shared/content/growth-v3/Operators';
type IconId = GrowthGadgetId | keyof typeof GROWTH_V3_ULTIMATES;
/** Original vector symbols, shared by loadout and match HUD. Decorative beside a text label. */
const shapes: Record<IconId, string> = {
  as_frag: '<path d="M25 18h14l5 11v14l-9 10H23l-7-10V29zM27 18V11h13l5 7M23 28h16M21 36h20M25 45h13M30 25v24"/>',
  as_concussion: '<circle cx="32" cy="34" r="12"/><path d="M27 22v-9h10M8 34H3m58 0h-5M15 16l-6-6m40 6 6-6M15 52l-6 6m40-6 6 6M30 29l6 5-6 5"/>',
  as_charge: '<rect x="13" y="24" width="36" height="25" rx="3"/><path d="M20 24v25m22-25v25M24 24V14h12l6-6M29 30l-4 7h8l-4 7M50 15l6 4m-5 4 6 4"/>',
  tk_cover: '<path d="M12 15h40v34H12zM18 15v34m28-34v34M24 22h16v11H24zM12 49l-5 7m45-7 5 7M23 42h18"/>',
  tk_interceptor: '<path d="M20 51h24M25 51V35h14v16M16 30a16 16 0 0 1 32 0M24 30a8 8 0 0 1 16 0M32 35V18M47 10l8 8m-8 0 8-8"/><circle cx="32" cy="33" r="3"/>',
  tk_plate: '<path d="M15 12h34v26L32 55 15 38zM23 20h18v15l-9 10-9-10zM27 28h10m-5-5v10"/>',
  sn_beacon: '<path d="M22 53h20M27 53V37h10v16M32 37V13M20 18a17 17 0 0 0 0 18m24-18a17 17 0 0 1 0 18M12 12a25 25 0 0 0 0 30m40-30a25 25 0 0 1 0 30"/><circle cx="32" cy="25" r="4"/>',
  sn_emp: '<circle cx="32" cy="32" r="23"/><path d="M35 15 22 34h10l-3 15 14-22H33zM4 32h5m46 0h5M32 4v5m0 46v5"/>',
  sn_decoy: '<path d="M10 25h11l14-12v38L21 39H10zM43 24a13 13 0 0 1 0 16m7-23a23 23 0 0 1 0 30M14 53h13"/>',
  md_smoke: '<path d="M13 45c-10-4-5-18 4-17-2-15 20-20 24-6 16-5 23 18 9 23zM17 52h30M25 33c0-8 12-8 12 0m-6 9h10"/>',
  md_station: '<rect x="11" y="22" width="42" height="32" rx="4"/><path d="M23 22v-9h18v9M28 29h8v7h7v8h-7v7h-8v-7h-7v-8h7z"/>',
  md_ammo: '<path d="M10 23h44v31H10zM16 23V12h32v11M20 46V33l4-5 4 5v13zM36 46V33l4-5 4 5v13zM20 41h8m8 0h8"/>',
  as_berserker: '<path d="m9 42 15-18 8 7 17-22-7 23-11 7-8-6-9 21M40 42l9-4 6 9-13 8z"/>',
  tk_juggernaut: '<path d="m10 16 22-8 22 8v19L32 57 10 35zM20 34l8 8 17-20M25 13l7-4 7 4"/>',
  sn_ghost: '<path d="M16 49V26a16 16 0 0 1 32 0v23l-8-5-8 8-8-8zM24 28h3m10 0h3M28 37h8M8 21l-4-4m52 4 4-4"/>',
  md_lifeline: '<path d="M32 53 10 32C-2 12 22 3 32 19 42 3 66 12 54 32zM12 32h11l5-10 7 21 6-11h11"/>',
};
export function growthIcon(id: IconId): string {
  return `<svg class="growth-symbol" data-growth-icon="${id}" viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${shapes[id]}</svg>`;
}
