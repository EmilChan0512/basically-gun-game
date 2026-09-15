import './ViewControls.css';

const widths = [1, 1.5, 2, 2.5, 3, 3.5];
/** Explicit screen framing shared by every class, independent of movement. */
export class ViewControls {
  readonly root = document.createElement('div');
  private index = 0;
  get factor() { return widths[this.index]; }
  constructor(parent: HTMLElement, clearInput: () => void) {
    this.root.className = 'view-controls'; this.root.setAttribute('aria-label', '屏幕视野调节');
    this.root.innerHTML = '<button type="button" data-view="closer" aria-label="拉近视野">拉近 −</button><button type="button" data-view="reset" aria-label="恢复默认视野"></button><button type="button" data-view="wider" aria-label="拉远视野">拉远 +</button>';
    this.root.addEventListener('pointerdown', event => { clearInput(); event.stopPropagation(); });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      this.index = button.dataset.view === 'reset' ? 0 : Math.max(0, Math.min(widths.length - 1, this.index + (button.dataset.view === 'wider' ? 1 : -1)));
      this.render(); button.blur(); event.stopPropagation();
    });
    parent.append(this.root); this.render();
  }
  private render() {
    this.root.querySelector('[data-view="reset"]')!.textContent = `视野 ${this.factor.toFixed(1)}× ↺`;
    this.root.querySelector<HTMLButtonElement>('[data-view="closer"]')!.disabled = this.index === 0;
    this.root.querySelector<HTMLButtonElement>('[data-view="wider"]')!.disabled = this.index === widths.length - 1;
  }
  lookAhead(pointerX: number, width: number) { return (Math.max(0, Math.min(1, pointerX / width)) - .5) * 800 * (this.factor - 1) / 2.5; }
  destroy() { this.root.remove(); }
}
