import { gameAudio, AUDIO_STORAGE, type AudioSettings } from './AudioService';
import './audio.css';
export function installAudioUI() {
  const root = document.createElement('details'); root.id = 'audio-settings';
  root.innerHTML = '<summary>声音设置</summary><div class="audio-panel"><label><input type="checkbox" data-audio="muted">静音</label>' +
    (['master','effects','voice'] as const).map((key, i) => `<label class="audio-slider"><span>${['总音量','音效音量','角色语音'][i]}</span><input aria-label="${['总音量','音效音量','角色语音'][i]}" type="range" min="0" max="100" data-audio="${key}"><output data-volume="${key}"></output></label>`).join('') +
    '<label><input type="checkbox" data-audio="subtitles">中文字幕</label><button type="button" id="audio-preview">试听角色语音</button></div>';
  const subtitle = document.createElement('div'); subtitle.id = 'audio-subtitle'; subtitle.setAttribute('role','status'); subtitle.setAttribute('aria-live','polite');
  document.body.append(root, subtitle);
  gameAudio.onSubtitle = text => { subtitle.textContent = text; subtitle.hidden = !text; };
  const refresh = () => {
    root.querySelectorAll<HTMLInputElement>('[data-audio]').forEach(input => {
      const key = input.dataset.audio as keyof AudioSettings, value = gameAudio.settings[key];
      if (typeof value === 'boolean') input.checked = value; else { input.value = String(Math.round(value * 100)); root.querySelector(`[data-volume="${key}"]`)!.textContent = `${input.value}%`; }
    });
    const legacy = document.getElementById('sound'); if (legacy) legacy.textContent = gameAudio.enabled ? '声音：开' : '声音：关';
  };
  gameAudio.onSettings = refresh; refresh();
  root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement; if (!input.dataset.audio) return;
    gameAudio.configure({ [input.dataset.audio]: input.type === 'checkbox' ? input.checked : Number(input.value) / 100 });
  });
  root.querySelector<HTMLButtonElement>('#audio-preview')!.onclick = () => { gameAudio.pause(false); void gameAudio.unlock().then(() => gameAudio.voice('medic')); };
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement)?.closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    const group = button.dataset.class;
    void gameAudio.unlock().then(() => {
      if (group) { gameAudio.stop(); gameAudio.pause(false); gameAudio.voice(group); }
      else if (button.id !== 'audio-preview') gameAudio.cue(button.matches('[data-equip],[data-weapon],[data-offhand],[data-skill],[data-item]') ? 'swap' : 'click');
    });
  }, true);
  document.addEventListener('pointerdown', () => { void gameAudio.unlock(); }, true);
  document.addEventListener('keydown', () => { void gameAudio.unlock(); }, true);
  document.addEventListener('visibilitychange', () => { gameAudio.setForeground(!document.hidden); if (!document.hidden) void gameAudio.unlock(); });
  window.addEventListener('blur', () => gameAudio.setForeground(false));
  window.addEventListener('focus', () => gameAudio.setForeground(!document.hidden));
  window.addEventListener('pagehide', () => gameAudio.stop());
  window.addEventListener('storage', event => { if (event.key === AUDIO_STORAGE) try { gameAudio.configure(JSON.parse(event.newValue ?? '{}'), false); } catch { /* Ignore malformed settings. */ } });
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') window.__strikeAudio = gameAudio;
}
declare global { interface Window { __strikeAudio?: typeof gameAudio } }
