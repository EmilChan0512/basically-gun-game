import { GROWTH_V3_GADGETS, type GrowthGadgetId } from '../../shared/content/growth-v3/Gadgets';
import { GROWTH_V3_ABILITIES, type GrowthAbilityId } from '../../shared/content/growth-v3/Operators';

export function growthAbilityDescription(id: GrowthAbilityId): string {
  const e = GROWTH_V3_ABILITIES[id];
  switch (id) {
    case 'as_roll': return '沿移动方向快速翻滚，可换弹；期间不能射击、切枪或使用道具。没有无敌，不穿墙。';
    case 'as_reloadrush': return `从当前枪备弹转入最多${e.transfer}发，再短时加速；期间不能射击、切枪或使用道具。`;
    case 'tk_barrier': return `减伤${e.reduction * 100}%，可正常射击；再次按E提前结束。`;
    case 'tk_shield': return `保护瞄准方向左右各60°，减伤${e.reduction * 100}%，最多吸收${e.shieldBudget}生命伤害；侧后方不受保护。举盾不能射击、换弹、切枪或使用道具。`;
    case 'sn_focus': return `散布降至${e.spread * 100}%，可射击，保持站位更容易命中；再次按E结束。`;
    case 'sn_relocate': return `脚步传播距离降至${e.noiseScale * 100}%；前${e.fireLock / 30}秒不能射击或使用道具，可换枪、换弹。`;
    case 'md_pulse': return `立即为${e.radius}px内无墙遮挡的受伤队友和自己恢复${e.heal}生命；没有可治疗目标不消耗冷却。`;
    case 'md_link': return `瞄准${e.radius}px内队友，每${e.pulseInterval / 30}秒恢复${e.heal}生命，共${e.duration / e.pulseInterval}次；无目标时可自疗，每跳${e.selfHeal}生命。自己受到生命伤害、目标超距或墙/烟遮挡立即断链；持续期间不能射击。`;
  }
}

export function growthGadgetDescription(id: GrowthGadgetId): string {
  const g = GROWTH_V3_GADGETS[id];
  switch (id) {
    case 'as_frag': return `释放后${g.fuse / 30}秒引爆，对部署物造成${g.structureDamageMax}—${g.structureDamageMin}伤害；墙体阻断爆炸。`;
    case 'as_concussion': return `释放后${g.fuse / 30}秒引爆，减速${g.slow * 100}%持续${g.slowTicks / 30}秒；不造成硬眩晕。`;
    case 'as_charge': return `部署${g.arm / 30}秒后再次按G遥控引爆，对部署物造成${g.structureDamageMax}—${g.structureDamageMin}伤害；被击毁或到期不爆炸。`;
    case 'tk_cover': return '阻挡双方子弹，人物可以穿过；爆炸和治疗不被掩体阻挡，可被敌方射毁。';
    case 'tk_interceptor': return `启动后最多拦截${g.intercepts}枚敌投掷物，每次间隔${g.interval / 30}秒；不能拦子弹，受到EMP会停机。`;
    case 'tk_plate': return `为自己提供${g.armor}护甲，持续${g.armorTicks / 30}秒；护甲不叠加，没有提升时不消耗份数。`;
    case 'sn_beacon': return `每${g.interval / 30}秒扫描，标记敌人最后位置${g.markTicks / 30}秒；墙和烟阻断扫描，不显示隐藏敌人模型。`;
    case 'sn_emp': return `令敌方拦截器、信标、诱饵和急救站停机${g.empTicks / 30}秒；不伤害玩家，不影响玩家开枪。`;
    case 'sn_decoy': return `落地后每${g.interval / 30}秒发出假枪声及短暂雷达信号，声音传播${g.noiseRadius}px；无伤害，可被击毁。`;
    case 'md_smoke': return '烟区阻断双方观察和依赖视线的治疗链、侦察；子弹仍可穿过，友方位置始终保留。';
    case 'md_station': return `每${g.interval / 30}秒为范围内受伤友军恢复${g.heal}生命，全站共享${g.healBudget}治疗预算；墙、烟和EMP可使治疗失效。`;
    case 'md_ammo': return `每名队友可自动领取一次当前枪基础携弹量${g.ammoScale * 100}%的备弹；不补充E或G，满弹时不消耗领取机会。`;
  }
}
