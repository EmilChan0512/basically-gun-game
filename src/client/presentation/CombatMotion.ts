export const combatMotion = { scale: 1 };
/** A local visual preference. It never changes a network command or simulation parameter. */
export function installCombatMotionControl(root: HTMLElement) {
  let reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { const saved = localStorage.getItem('strike.motion.reduced'); if(saved!==null)reduced=saved==='true'; } catch { /* Storage can be disabled. */ }
  const button=document.createElement('button');button.id='combat-motion-setting';
  const update=()=>{combatMotion.scale = reduced ? .25 : 1;button.textContent='减少枪械晃动';button.setAttribute('aria-pressed',String(reduced));};
  button.onclick=()=>{reduced=!reduced;try{localStorage.setItem('strike.motion.reduced',String(reduced));}catch{/* Optional persistence. */}update();};
  update();root.append(button);
}
