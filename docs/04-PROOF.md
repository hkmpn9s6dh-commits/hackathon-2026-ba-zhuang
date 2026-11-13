# 04 — PROOF：证据清单

> 闸 B / 闸 C 的账。每条都能用命令复跑。基线：2026-11-13，Windows 11 + Node 22.22.2。

## 1. 一条命令复验

```bash
npm ci
bash scripts/verify.sh
```

在**全新 clone** 上跑，输出见 `proof/clone-check.md`（2026-11-13 11:20，17 项全绿）。

线上：https://hkmpn9s6dh-commits.github.io/hackathon-2026-ba-zhuang/ （2026-11-13 11:25 冒烟：标题 1.25 s 出现、12 窑位 / 5 件器、封窑进烧窑、零控制台报错）。

## 2. 验收条件逐条

| 编号 | 条件 | 结果 | 证据 |
|---|---|---|---|
| AC-1 | 3 秒内出标题页，无登录、无外部请求 | PASS | e2e：`title appears under 3s — 98ms`；`no external requests` |
| AC-2 | 12 个窑位；点器再点窑位可放；同格不能重复放 | PASS | e2e：`twelve chambers — found 12`、`click places the ware`、`click again returns it`、`封窑 starts the fire` |
| AC-3 | 选中瓷器时窑位显示过火/合适/生烧 | PASS | 单测 `forecast splits over/fit/under`；e2e：`verdicts cover more than one outcome — over/fit/under` |
| AC-4 | 投柴、火眼、火照子可用且改变状态 | PASS | e2e：`投柴 raises the heat — 0.000 → 0.038`、`vents reach level 3` |
| AC-5 | 满柴满风趋近 1.0；断柴 20 秒降 ≥0.15 | PASS | 单测 `full fuel and wide vent approach the top`、`cutting the wood drops the heat` |
| AC-6 | 事件卡在固定时辰弹出，两选项各有后果 | PASS | 单测 `湿柴 costs less wood but damps the fire`；e2e：`event card shows up mid-fire` |
| AC-7 | 火照子 3 次，用尽后禁用 | PASS | e2e：`three shards, then the button locks` |
| AC-8 | 十二时辰走完自动进开窑 | PASS | e2e：`twelve 时辰 end in the kiln opening — open` |
| AC-9 | 每件都有判定，五种结局可复现 | PASS | 单测覆盖 over/under/excellent/good/cracked/flambe；e2e：`every piece gets a verdict — excellent,good,excellent,good,good` |
| AC-10 | 结算显示铜钱、声誉、推进夜次 | PASS | 单测 `a full order pays the reward`、`ending climbs with reputation`；e2e：`the night advances` |
| AC-11 | 纯键盘可完成一夜 | PASS | e2e：`Enter seals the kiln`、`keyboard feeds and sets the vent`、`keyboard night reaches the kiln opening` |
| AC-12 | 1280/1920/390 三视口不裁切、无横向滚动 | PASS | e2e：三条 `overflow 0` |
| AC-13 | 零控制台报错 | PASS | e2e：`no console errors` |
| AC-14 | 构建产物无外部 URL | PASS | `verify.sh`：`no external URLs in the bundle` |

单元测试 21 条、浏览器端到端 28 条，全绿。

## 3. 平衡性验证（不是靠感觉）

`test/sim.test.ts` 里有一个「认真看火的把桩」控制器，按曲线调风门、按缺口投柴，跑完三夜：

- 三夜都能在柴烧完之前到峰值（`burns through the night stock without running dry`）；
- 峰值与曲线终点差 < 0.1（同一条断言）；
- 全程风门拉满的粗心玩家会超出曲线 0.25 以上（`a careless stoker overshoots badly`）。

这三条保证「认真玩能过、乱玩会砸」，而不是数值随便填。

## 4. 闸 C：全新 clone

见 `proof/clone-check.md`：`git clone` → `npm ci` → `bash scripts/verify.sh` 的输出原文。

## 5. 闸 D：盲排（未过线）

**题目**：7 张游戏「第一眼画面」随机字母命名，只凭图排序（1 最好）。我方是标题页，其余 6 张是公开商业作品的封面（Frostpunk、This War of Mine、Papers, Please、太吾绘卷、GRIS、Journey）。映射见 `proof/rank/r1/map.json`，拼版见 `proof/rank/r1/sheet.png`。

| 轮 | 评委（家族） | 我方名次 | 原文要点 |
|---|---|---|---|
| R1 | GLM 5.3f | **7 / 7** | 「大片近黑、主体窑炉暗得几乎看不见……半成品感」 |
| R1 | GPT-6.1 | **7 / 7** | 「画面过暗、主体偏小，标题与玩法最难迅速读懂」 |
| R2（提亮 + 放大窑体 + 加人物斗影后） | GLM 5.3f | **7 / 7** | 「画面最暗没有视线落点，右侧网格矩形与界面小字透出半成品感」 |
| R2 | Claude（Opus） | 未交卷 | 该机 Cursor 登录过期（`NOT_LOGGED_IN`），两次都没跑起来 |

**结论：闸 D 未过。** 两轮改法（提亮、放大、加主体）都没有改变评委的第一印象。

**诊断**（三轮评语一致指向同一处）：商业封面是「一个主体 + 高对比 + 大字」的构图；本作标题页是「夜景全貌 + 小字」，在缩略图尺寸下既没有落点也不够亮。这不是调参能补的，是构图范式不同。

**按父单规则**：同一道题改做法两轮还没过，停下来交用户定（AME-1134 规则 3）。

**下一轮建议**（若用户要做）：不再拿「实机标题页」当第一眼画面，改为专门绘制的 key art —— 单一主体（把桩师傅侧影 + 手中火照子）、高对比、标题压在图上是唯一的字。

## 6. 用户试玩之后的一轮返工（2026-11-13 下午）

用户第一轮试玩提了两条：**画面太粗糙、一眼是廉价 AI 感**；**玩不明白、卡住之后挫败感很强**。

改了什么：

| 问题 | 改法 | 证据 |
|---|---|---|
| 瓷碗像纸杯 | 重写瓷器绘制：圆柱明暗（左亮右暗）、真实碗口（深色内壁 + 远侧碗壁）、圈足、足部遮蔽阴影、刻花改成从足部放射的莲瓣；宽高比从 0.98 改成 1.38（宽口浅腹）；每件按 uid 微旋 0–2°，不再是复制粘贴 | `submission/stills/01-load-verdicts.png`、`proof/shots/zoom-card.png` |
| 窑是一个棕色团块 | 砖墙改成真砖块（错缝、每块独立色差、暗色灰缝）；空窑位画低矮匣钵圈；窑位内加顶部阴影 + 火砖台沿 + 底部火光；窑门密封后铁板从下往上烧红、缝隙漏光；器物随火候变亮 | `submission/stills/03-fire.png` |
| 画面发"平" | 全屏叠一层 160×160 的颗粒（overlay，alpha 低）；夜空调暗、瓷器提亮，拉开明暗层次 | 同上 |
| 不知道怎么推进 | 加弱引导：底部一句宋体提示 + 目标控件 2.4 秒呼吸环；`封窑` 为什么不能点也说清楚 | e2e AC-15 两条 |
| 火眼 0–3 不知为何物 | 按钮改成 `0 闭 / 1 微 / 2 中 / 3 大`，标题旁一句「风门：开大升得快，收小更稳」 | `submission/stills/03-fire.png` |
| 火照子不知干嘛、点了没反馈 | 面板加行动建议一行；关掉后提示续挂 9 秒；火路图留一枚小三角记下这次判断 | `submission/stills/04-shard.png` |
| 火路图看不懂 | 右上角标题 + 两行图例；第一夜开局 6 秒先讲怎么读 | 同上 |
| 开窑一件件点太单调 | 改成**点窑里的器**取出来（每件一个「取」热区 + 呼吸环），另留「全部取出」 | e2e AC-16 |
| 清点平平无奇 | 改成一排实物 + 成器数与最佳一件的摘要 + 明细 | `submission/stills/07-settle.png` |

第二轮返工后复验：`28/28` e2e 全绿（新增 AC-16：点窑里的器能取出），单测 21 条不变。

## 7. 已知边界

- 竖屏下「收卷」与开窑的一排器物偏挤，只保证不裁切、可完成。
- 火候模型是一阶线性模型，不是真实窑炉的热工仿真；它服务于「手感」而不是物理正确。
- 三夜的内容量约 15–20 分钟；10 强要求的「15 分钟以上可玩内容」刚好压线，若要更稳需加第四夜或随机订单。
- `docs/07-UI.md` 里的窑位尺寸写的是 132px，实际按视口缩放为 46–118px（竖屏更小），以实现为准。
