import { Accounts } from './Accounts';
import { CareerProgress } from './CareerProgress';
import { CLASSES, SKILLS, WEAPONS, ITEMS, SPECIAL_OFFHANDS, canEquipOffhand, loadoutStats, type ClassId, type ItemId, type SkillId, type SpecialOffhandId } from './Catalog';
import type { WeaponId } from '../combat/Combat';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function renderAccounts(root: HTMLElement, accounts: Accounts, onLogin: () => void, onGuest: () => void, onBack?: () => void) {
  if (accounts.active) {
    root.innerHTML = `<div class="compact-panel"><p class="eyebrow">本机账号</p><h2>${escapeHtml(accounts.active.name)}</h2><p class="story">角色、军资、配装和关卡进度归此账号独立保存。退出后可用密码重新登录。账号不连接云端。</p><div class="panel-actions"><button id="account-back" class="primary">返回游戏</button><button id="logout">退出并切换账号</button></div></div>`;
    root.querySelector<HTMLButtonElement>('#account-back')!.onclick = onBack ?? onLogin;
    root.querySelector<HTMLButtonElement>('#logout')!.onclick = () => { accounts.logout(); renderAccounts(root, accounts, onLogin, onGuest); };
    return;
  }
  let registering = accounts.names.length === 0;
  const render = () => {
    root.innerHTML = `<div class="compact-panel account-panel"><p class="eyebrow">PROJECT STRIKE / 本机账号</p><h2>${registering ? '创建你的行动档案。' : '欢迎归队。'}</h2><p class="story">不同账号独立保存职业成长、武器和战役。无需联网。首次创建账号会保留这台设备已有的旧战役进度。</p><form id="account-form"><label>账号名<input id="account-name" name="username" autocomplete="username" required minlength="2" maxlength="24" placeholder="2—24个汉字、字母或数字"></label><label>密码<input id="account-password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" required minlength="6" maxlength="128" placeholder="至少6个字符"></label><p id="account-error" role="alert"></p><button id="account-submit" class="primary" type="submit">${registering ? '创建账号并进入' : '登录'}</button></form><div class="panel-actions"><button id="account-toggle">${registering ? '已有账号，去登录' : '创建新账号'}</button><button id="guest-play">临时试玩</button></div><p class="brief-tip">本机档案只保存在当前浏览器；清除网站数据会删除账号。临时试玩不保存成长。</p></div>`;
    root.querySelector<HTMLButtonElement>('#account-toggle')!.onclick = () => { registering = !registering; render(); };
    root.querySelector<HTMLButtonElement>('#guest-play')!.onclick = () => { accounts.logout(); onGuest(); };
    root.querySelector<HTMLFormElement>('#account-form')!.onsubmit = async event => {
      event.preventDefault();
      const submit = root.querySelector<HTMLButtonElement>('#account-submit')!;
      const name = root.querySelector<HTMLInputElement>('#account-name')!.value;
      const password = root.querySelector<HTMLInputElement>('#account-password')!.value;
      submit.disabled = true;
      try { if (registering) await accounts.register(name, password); else await accounts.login(name, password); onLogin(); (document.activeElement as HTMLElement)?.blur(); }
      catch (error) { const label = root.querySelector('#account-error'); if (label) label.textContent = error instanceof Error ? error.message : '账号操作失败'; }
      finally { submit.disabled = false; }
    };
  };
  render();
}

export function renderArmory(root: HTMLElement, progress: CareerProgress, onBack: () => void, onChange: () => void) {
  const render = () => {
    const c = progress.data.career, l = progress.loadout, stats = loadoutStats(l), definition = CLASSES[c.selected];
    const ownedLabel = (owned: boolean, equipped: boolean, locked: boolean, price: number) => equipped ? '已装备' : locked ? '等级未解锁' : owned ? '装备' : `${price} 军资 · 购买`;
    root.innerHTML = `<div class="armory-panel"><div class="armory-heading"><div><p class="eyebrow">职业 / 军械库 / 养成</p><h2>为下一次行动做准备。</h2></div><button id="armory-back" class="primary">返回任务</button></div><div id="career-wallet">军资 ${c.credits} · ${definition.name} Lv.${l.level} · 经验 ${progress.current.xp} / ${l.level < 10 ? l.level * 160 : 'MAX'}</div><div class="class-tabs">${(Object.keys(CLASSES) as ClassId[]).map(id => `<button data-class="${id}" class="${c.selected === id ? 'active' : ''}">${CLASSES[id].name}<small>Lv.${c.classes[id].loadout.level}</small></button>`).join('')}</div><div class="class-summary"><strong>生命 ${stats.health} · 瞄准 ${stats.aim.toFixed(2)} · 弹药 ×${stats.ammo.toFixed(2)}</strong><span>${definition.passive}</span></div><div class="training"><span>可用训练点：${progress.trainingPoints}</span><button data-train="vitality" ${progress.trainingPoints < 1 || l.training.vitality >= 3 ? 'disabled' : ''}>体能 ${l.training.vitality}/3 · +8生命</button><button data-train="handling" ${progress.trainingPoints < 1 || l.training.handling >= 3 ? 'disabled' : ''}>控枪 ${l.training.handling}/3 · +0.1瞄准</button></div><h3>职业技能 <small>E 施放 · 每次装备一个</small></h3><div class="skill-grid">${definition.skills.map(id => {
      const s = SKILLS[id], equipped = id === l.skill, locked = l.level < s.level;
      return `<article class="gear-card"><strong>${s.name} <small>Lv.${s.level}</small></strong><p>${s.description} · 冷却${s.cooldown / 30}秒</p><button data-skill="${id}" ${equipped || locked ? 'disabled' : ''}>${equipped ? '已装备' : locked ? `职业Lv.${s.level}解锁` : '装备技能'}</button></article>`;
    }).join('')}</div><h3>枪械 <small>永久解锁，全职业共享；装备仍需职业等级</small></h3><div class="weapon-grid">${(Object.keys(WEAPONS) as WeaponId[]).map(id => {
      const w = WEAPONS[id], owned = c.weapons.includes(id), equipped = l[w.slot] === id, locked = l.level < w.level;
      return `<article class="gear-card ${equipped ? 'equipped' : ''}"><div class="weapon-art"><img src="/assets/reference/${id}.png" alt="${w.name}" /></div><strong>${w.name} <small>Lv.${w.level} · ${w.slot === 'primary' ? '主武器' : '副武器'}</small></strong><p>${w.description}</p><span>伤害 ${w.config.damage}${w.pellets > 1 ? '×' + w.pellets : ''} · 弹匣 ${w.config.magazineSize} · 射程≈${w.config.rangeUnits * 10}</span><button data-weapon="${id}" ${equipped || locked || !owned && c.credits < w.price ? 'disabled' : ''}>${ownedLabel(owned, equipped, locked, w.price)}</button></article>`;
    }).join('')}</div><h3>特殊副手 <small>替换副枪 · Q切换 · 按职业等级免费解锁</small></h3><div class="item-grid">${(Object.keys(SPECIAL_OFFHANDS) as SpecialOffhandId[]).filter(id => canEquipOffhand(c.selected, id)).map(id => {
      const item = SPECIAL_OFFHANDS[id], equipped = l.secondary === id, locked = l.level < item.level;
      return `<article class="gear-card ${equipped ? 'equipped' : ''}"><img src="/assets/reference/${id}.png" width="112" height="68" alt="${item.name}" /><strong>${item.name} <small>Lv.${item.level}</small></strong><p>${item.description}</p><button data-offhand="${id}" ${equipped || locked ? 'disabled' : ''}>${equipped ? '已装备' : locked ? `职业Lv.${item.level}解锁` : '装备副手'}</button></article>`;
    }).join('') || '<p class="brief-tip">刀类仅限刺客，盾牌仅限重装兵；当前职业可装备上方副枪。</p>'}</div><h3>战术道具 <small>G 使用 · 许可证永久，每次出战补充2份</small></h3><div class="item-grid">${(Object.keys(ITEMS) as ItemId[]).map(id => {
      const item = ITEMS[id], owned = c.items.includes(id), equipped = l.item === id, locked = l.level < item.level;
      return `<article class="gear-card"><strong>${item.name} <small>Lv.${item.level}</small></strong><p>${item.description}</p><button data-item="${id}" ${equipped || locked || !owned && c.credits < item.price ? 'disabled' : ''}>${ownedLabel(owned, equipped, locked, item.price)}</button></article>`;
    }).join('')}</div><p class="brief-tip">完成任务与击杀可获得经验、军资；失败也有少量奖励。每个职业独立升级，每级获得1个训练点。训练点不跨职业共享。</p></div>`;
    root.querySelector<HTMLButtonElement>('#armory-back')!.onclick = onBack;
    const refresh = () => { onChange(); render(); };
    root.querySelectorAll<HTMLButtonElement>('[data-class]').forEach(b => b.onclick = () => { progress.selectClass(b.dataset.class as ClassId); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-train]').forEach(b => b.onclick = () => { progress.train(b.dataset.train as 'vitality' | 'handling'); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach(b => b.onclick = () => { progress.equipSkill(b.dataset.skill as SkillId); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(b => b.onclick = () => { const id = b.dataset.weapon as WeaponId; if (c.weapons.includes(id) || progress.buyWeapon(id)) progress.equipWeapon(id); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(b => b.onclick = () => { const id = b.dataset.item as ItemId; if (c.items.includes(id) || progress.buyItem(id)) progress.equipItem(id); refresh(); });
    root.querySelectorAll<HTMLButtonElement>('[data-offhand]').forEach(b => b.onclick = () => { progress.equipOffhand(b.dataset.offhand as SpecialOffhandId); refresh(); });
  };
  render();
}
