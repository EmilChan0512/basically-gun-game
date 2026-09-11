# 美术资源管线

2026-09-11：按当前项目方向，优先使用已经静态导出的原游戏资源丰富本机游戏；缺失素材才使用本机 ComfyUI 和本地模型生成。原始 SWF、ActionScript 和批量导出仍保留在 gitignored archaeology 目录，运行包只包含经过挑选的 PNG，不加载或执行原游戏。

## 当前素材

`public/assets/reference/manifest.json` 记录来源 SWF 哈希、符号/帧、透明裁边范围、输出尺寸与 SHA256。共 18 张纹理：7 把枪、头/躯干/手臂/腿/靴、枪口火光、补给箱、云层/远景/哨站/飞行器。shotgun 使用 M3 图像，其余枪名直接对应原时间轴标签。

角色采用独立分件绘制，行走、蹲伏、跳跃、瞄准和换弹倾斜跟随当前游戏模拟；这是本项目动画适配，不宣称还原原版完整动作。命中盒、射击原点、伤害和移动逻辑保持独立。职业与队伍采用着色、名字和血条区分。

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

本轮所需基础角色、枪械和场景装饰均已找到，因此未创建 ComfyUI 管线，也未调用图片模型。原创职业专属外观、新地图主题和专属物品图标作为后续设计内容；先明确尺寸、透明背景、视角、动画拆件要求，再检查本机 ComfyUI 模型并保存可复用工作流。运行老游戏或逐帧观察仍需先询问用户。
