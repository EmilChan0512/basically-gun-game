# 美术资源管线

2026-09-13：新增未来军事风格 UI、本机 ComfyUI 工作流及 16 项首版素材。操作、版本与复用规则见 [UI v2 管线](UI_V2.md)。本轮按用户要求每项仅生成一版，不作自动挑选或重抽。以下保留原战斗素材的来源和重建说明。

2026-09-11：按当前项目方向，优先使用已经静态导出的原游戏资源丰富本机游戏；缺失素材才使用本机 ComfyUI 和本地模型生成。原始 SWF、ActionScript 和批量导出仍保留在 gitignored archaeology 目录，运行包只包含经过挑选的 PNG，不加载或执行原游戏。

职业刀盾扩展及18张原版副手素材、握持裁边帧和360度盾牌显示，见 [职业副手说明](OFFHAND_CLASSES.md)。

## 当前素材

2026-09-11 职业与射击美术更新：新增20张职业分件，由 `tools/curate-class-art.py` 从静态导出重建，来源和哈希见 `public/assets/reference/classes-manifest.json`。依照 `Stats_Classes.startFrame` 与 `UnitMC.setSkin`，选用刺客1、医疗兵51、重装兵101、突击兵151帧（各职业第一个皮肤）。保留原素材颜色，阵营由名字、血条等标识区分。无职业信息的角色默认使用医疗兵外观。

`ReferenceArt` 供战役、训练场和联机共用。换弹以剩余帧数计算进度，分为压枪、辅助手离开前握把并下移、回到装填处、抬枪复位；取消换弹或切枪后回到持枪姿势。参考 `Guns.setFrame` 的双臂动作结构，采用程序插值适配现有分件，不等同原作完整时间轴。换弹耗时和命中判定保持现有模拟规则。

枪线采用 `Stats_Guns.params` 原作参数：普通枪为 `0xffffc4`，3.5px/0.3透明度外层、1.5px/0.6透明度内层；Dragunov为灰白双色。保留本项目3帧淡出。显示起点复用当前角色枪口位置，按枪图末端像素中心修正枪管高度，火光从同一枪口接出；短距离终点位于枪口后方时不画反向枪线。弹道源点、穿行和伤害计算保持原状。战役通过射手ID触发火光，联机通过去重后的射击事件触发。

重建职业分件：

```powershell
& 'tools/vendor/java/jdk-21.0.12.1+1-jre/bin/java.exe' '-Djava.awt.headless=true' -jar tools/vendor/ffdec/ffdec.jar -selectid '538,568,598,631,666' -export sprite archaeology/local/class-export archaeology/swf/sfh1_reference.swf
python tools/curate-class-art.py
```

验收截图：`artifacts/qa/class-reload-gallery.png`、`artifacts/qa/reference-battle.png`、`artifacts/qa/reference-crouch.png`。`npm run check` 的278项单元测试和构建通过，美术与联机显示3项浏览器测试通过。

`public/assets/reference/manifest.json` 记录来源 SWF 哈希、符号/帧、透明裁边范围、输出尺寸与 SHA256。共 18 张纹理：7 把枪、头/躯干/手臂/腿/靴、枪口火光、补给箱、云层/远景/哨站/飞行器。shotgun 使用 M3 图像，其余枪名直接对应原时间轴标签。

角色采用独立分件绘制，行走、蹲伏、跳跃、瞄准和换弹跟随当前游戏模拟；这是本项目动画适配，不宣称还原原版完整动作。命中盒、射击原点、伤害和移动逻辑保持独立。职业采用专属分件，队伍采用名字和血条区分。

战役与训练场共用 ReferenceArt.ts，军械库直接使用同一批枪械 PNG。战役增加远景装饰；实际可行走平台仍由任务地形定义，背景中的建筑不可碰撞。

## 重建

先运行现有考古管线得到首帧导出。枪械需要补充静态导出全部时间轴帧（不运行 SWF）：

```powershell
& 'tools/vendor/java/jdk-21.0.12.1+1-jre/bin/java.exe' '-Djava.awt.headless=true' -jar tools/vendor/ffdec/ffdec.jar -selectid '375' -export sprite archaeology/local/curated-export archaeology/swf/sfh1_reference.swf
python -m pip install pillow
python tools/curate-art.py
npm run package:game
```

-selectid 按符号筛选，不能用按帧筛选的 -select 替代。curate-art.py 只裁剪透明边缘并保存资源与清单。游戏运行无需 Python、Java、FFDec 或联网。

## 后续缺口

原战斗角色、枪械和场景继续复用静态导出资源。UI v2 的本机 ComfyUI 管线独立生成菜单背景、职业概念像及分类图，不替换战斗动画拆件；后续素材可以沿用版本化流程。
