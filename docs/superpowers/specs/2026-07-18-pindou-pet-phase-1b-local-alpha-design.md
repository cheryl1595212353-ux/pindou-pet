# 虚拟宠物 Phase 1B：本地透明背景提取与像素保持设计规格

状态：草案，等待用户批准

日期：2026-07-18

## 1. 决策背景

Phase 1A 已确认 Candidate 03 的 2.5D 方块像素风符合用户预期，但两次相关输出都
只是把棋盘格画进 RGB 图片，并没有真实 alpha。唯一一次生成式背景修复还重画了
猫的头、身体、四肢、背部花纹和尾巴，因此已按批准的门禁记录为
`STOP_REVISE_STYLE`，不得再次调用生成工具修复。

这个结果否定的是“依靠生成模型保持所有像素不变地完成抠图”，不是 Candidate 03
的美术方向。原 Phase 1 架构本来就不要求生成 Provider 原生透明：普通 RGB/RGBA
结果应由本地分割掩码确定性合成为透明角色。

Phase 1B 因此只处理一个问题：在不重新生成、不重画宠物的前提下，从已接受风格的
原始 Candidate 03 得到真实透明 PNG，并证明该方法值得进入完整 Phase 1 三猫门禁。

## 2. 目标

Phase 1B 必须交付一个完全离线、可重复、可审计的本地 alpha 流程：

1. 读取固定的原始 Candidate 03；
2. 由本地前景分割产生二值 `FOREGROUND` 掩码；
3. 可选地进行一次只修改掩码的人工边界校正；
4. 把掩码作为 alpha 应用于原始 RGB，不生成新的宠物像素；
5. 生成透明高清角色与最近邻预览；
6. 经过机械检查、独立视觉检查和用户最终门禁。

Phase 1B 的成功只关闭“透明背景”这一项可行性风险，不代表真实宠物输入、完整本地
感知 bundle、生产 Provider、延迟、成本或 Phase 1 三猫硬门禁已经通过。

## 3. 明确不做

- 不调用 `image_gen`、CLI 图像生成、付费 API 或用户 API Key；
- 不产生第四个造型候选，不消耗或重置 Phase 1A 的历史调用次数；
- 不重绘、修复、补全、平滑、锐化、重采样或重新着色宠物；
- 不改变画布尺寸、角色位置、姿势、轮廓、花纹或像素网格；
- 不把 `FOREGROUND` 加进既有六值 `PartLabel`；
- 不实现 Web/API 路由、上传流程、队列、编辑器、动画、拼豆量化或导出；
- 不把私有图片、模型二进制、掩码或绝对路径提交到 Git；
- 不因单猫 alpha PASS 而绕过 Phase 1 的三猫门禁进入 Phase 2。

## 4. 冻结输入与历史证据

唯一允许处理的源图为：

```text
var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-call-03.png
```

固定属性：

- SHA-256：`b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa`；
- 尺寸：`1254×1254`；
- 模式：RGB，无真实 alpha；
- 风格：用户接受的 Candidate 03 受控方形像素微纹理；
- 身份：同一只短毛三花猫，白色主毛色、绿色眼睛、猫自身左眼橘斑、猫自身
  右耳黑斑、背部橘黑斑、橘黑环纹深色尾尖；
- 构图：脸朝用户，身体向画面右侧约 20°，尾巴在画面右侧，完整角色不裁切。

必须继续保留并引用 Phase 1A 的旧风格评审、用户选择、失败校正输出、失败最终评审
和 STOP manifest。Phase 1B 不覆盖、改写或删除这些文件。

## 5. 选定架构

```text
immutable source RGB
        |
        v
local licensed foreground model
        |
        v
automatic binary FOREGROUND mask
        |
        +---- optional one mask-only correction
        |
        v
pixel-preserving alpha compositor
        |
        v
RGBA character + deterministic previews + evidence manifest
```

### 5.1 本地前景模型

正式验收路径使用本地运行、许可证允许项目使用、版本与文件哈希固定的前景分割模型。
模型文件只放在被 Git 忽略的 `var/models/`。实施前必须提交不含模型二进制的许可证与
来源审计，记录来源 URL、许可证、版本、输入输出、预处理、后处理和 SHA-256。

模型只负责输出前景置信度或二值掩码，不允许输出或生成新的 RGB 图像。下载模型和
安装依赖属于开发环境准备；实际 alpha 运行必须可断网完成。

只针对棋盘格颜色进行边界连通／颜色键提取可以作为诊断基线，但不能单独证明面对
不同背景的真实宠物流程可行，也不能替代本地分割模型的 Phase 1B 验收结果。

### 5.2 `FOREGROUND` 边界

`FOREGROUND` 是独立的实例前景证据，不是 `BODY`、`HEAD`、
`SCREEN_LEFT_FRONT_PAW`、`SCREEN_RIGHT_FRONT_PAW`、`TAIL`、`EYES` 之一。
Phase 1B 不生成六个部件掩码，也不修改 Phase 0 的 `SegmentationProvider` 公共合同。
后续完整 Phase 1 可把通过的前景路径接入 `LocalPerceptionBundle`。

### 5.3 可选人工校正

自动掩码必须先单独保存和评审。若只存在少量边界缺失、孔洞或背景残留，允许最多
一次人工掩码校正：

- 只能把掩码像素在 `0` 与 `255` 之间切换；
- 不能打开或修改源 RGB；
- 自动掩码、校正掩码、差异像素数和校正用时必须同时保留；
- 不得借人工校正改变猫的轮廓设计、补画花纹或增加缺失肢体；
- 自动掩码若大范围失败或无法辨认完整猫，直接 STOP，不以手工重画整只猫绕过。

人工校正次数为零或一；重复保存同一次校正不算新版本，但任何第二组不同校正像素
都违反门禁。

## 6. 像素保持合成合同

合成器接收源 RGB 和最终二值掩码，输出同尺寸 RGBA PNG。它必须满足：

- 画布严格保持 `1254×1254`，不得裁剪、移动或缩放；
- alpha 只能包含 `0` 和 `255`，不得产生半透明抗锯齿；
- 对每个 `alpha=255` 的坐标，输出 RGB 必须与源图同坐标 RGB 逐字节一致；
- 对每个 `alpha=0` 的坐标，输出 RGB 统一写为 `(0, 0, 0)`，消除透明区中的
  棋盘格残留并确保确定性；
- 不做颜色空间变换、调色、去噪、形态学平滑或边缘羽化；
- 相同源图、模型清单、参数和校正掩码重复运行，alpha 哈希、前景 RGB 哈希和最终
  PNG 哈希必须完全一致。

为避免“输出文件哈希变化但肉眼看不出”的模糊结论，manifest 至少记录：

- 源图路径和 SHA-256；
- 模型清单路径和 SHA-256；
- 自动掩码路径、SHA-256、前景像素数；
- 可选校正掩码路径、SHA-256、变化像素数和校正次数；
- 最终掩码 SHA-256；
- 源前景 RGB SHA-256 与输出前景 RGB SHA-256；
- 输出 PNG 路径、SHA-256、尺寸、模式、alpha 唯一值；
- 两次重复运行的结果哈希；
- 最终决定与用户原话。

## 7. 私有运行目录与可提交内容

Phase 1B 使用独立私有目录，不覆盖 Phase 1A：

```text
var/phase-1b/synthetic-cat-01-local-alpha/
  input/source.png
  models/model-manifest.json
  masks/automatic.png
  masks/corrected.png            # 仅在一次人工校正发生时存在
  output/character-hd.png
  output/preview-58.png
  output/preview-464.png
  reviews/automatic-mask-review.json
  reviews/final-character-review.json
  reviews/user-decision.json
  manifest.json
```

Git 只允许提交：

- 本设计规格及随后批准的实施计划；
- 不含私有媒体的实验 README、JSON schema／example；
- 最小本地 alpha 工具和自动化测试；
- 合成测试图片与合成掩码；
- 模型许可证／来源审计和脱敏结果摘要。

真实猫图、Candidate 03、实际掩码、模型二进制、绝对路径和完整私有 manifest 均留在
`var/`，不得通过 Git、测试夹具、日志、异常、Base64 或 data URI 泄露。

## 8. 预览合同

只有高清输出通过机械 alpha 与像素保持检查后，才允许生成预览：

- `preview-58.png`：将完整透明角色等比放入 58×58 透明画布，只使用最近邻；
- `preview-464.png`：`preview-58.png` 的精确 8 倍最近邻放大；
- 两张预览均必须为真实 RGBA，透明区不得出现棋盘格、白边或暗边；
- 预览只验证低分辨率轮廓与花纹可读性，不声称已完成分层、rig 或动画。

## 9. 验收门禁

### 9.1 机械门禁

以下条件必须全部通过：

1. 源图哈希与冻结值一致；
2. 自动掩码存在、尺寸正确、只含 `0/255`，且猫主体可见；
3. 校正次数为 `0` 或 `1`，证据与 manifest 一致；
4. 最终输出是 `1254×1254` RGBA PNG，alpha 同时包含 `0` 和 `255`；
5. 最终 alpha 不含除 `0/255` 外的值；
6. 所有不透明坐标的输出 RGB 与源 RGB 逐字节一致；
7. 所有透明坐标的输出 RGB 为 `(0,0,0)`；
8. 两次独立运行的最终掩码、前景 RGB 和 PNG 哈希一致；
9. 58×58 与 464×464 预览满足精确最近邻关系；
10. `var/phase-1b` 没有任何 Git 跟踪文件，manifest 不含绝对路径、密钥字段、
    Base64 或 data URI。

任一机械门禁失败都禁止生成 PASS manifest，也不能通过视觉“看起来还行”覆盖。

### 9.2 独立视觉门禁

审查者必须同时查看原始 Candidate 03、alpha 叠加图、透明角色分别置于纯白、纯黑和
高饱和洋红背景上的合成预览，以及 58×58/464×464 预览，并确认：

- 猫的完整轮廓、耳朵、四爪、身体和尾巴均保留；
- 眼睛、脸部斑纹、背部斑块和尾巴环纹没有缺失、交换或新增；
- 没有棋盘格残留、背景岛、内部透明孔洞、白边、暗边或半透明毛边；
- 方形像素、阶梯轮廓、有限色阶和 Candidate 03 的受控微纹理保持不变；
- 没有重画、平滑、位移、裁切或身份漂移。

评审 JSON 的 `pass` 必须由所有布尔项和空 `violations` 列表机械推导，不能手写一个
与子项矛盾的总 PASS。

### 9.3 用户最终门禁

机械门禁和独立视觉门禁全部通过后，向用户展示：

1. 原始 Candidate 03；
2. 透明高清角色在白／黑／洋红背景上的效果；
3. 58×58 预览；
4. 464×464 预览；
5. 自动掩码与最终掩码的差异摘要。

用户必须明确返回以下之一：

```text
LOCAL_ALPHA_PASS
STOP_ALPHA_EXTRACTION
```

没有用户明确 PASS，就不能把 Phase 1B 标记为成功。

## 10. 结果状态与停线规则

### `LOCAL_ALPHA_PASS`

表示 Candidate 03 已通过离线本地 alpha、像素保持、预览和用户门禁。保留可复现
证据，并把通过的本地前景与合成方法作为完整 Phase 1 感知 bundle 的候选输入。

### `STOP_ALPHA_EXTRACTION`

以下任一情况必须 STOP：

- 找不到许可证清晰且可本地运行的模型；
- 自动掩码大范围失败，需要手工重画整只猫；
- 一次掩码校正后仍有明显缺失、孔洞、背景残留或边缘污染；
- 任一不透明宠物 RGB 与源图不同；
- 输出仍无真实 alpha、出现半透明边缘或重复运行不确定；
- 独立审查或用户拒绝。

STOP 后保留证据，不再调用生成工具，不增加第二次掩码校正，不降低门槛，也不进入
Phase 2。

## 11. 实施边界

本规格批准后，下一步先编写独立 Phase 1B Implementation Plan，再按测试驱动实施。
计划应限制在以下类型的文件：

- `tools/` 下的最小本地 alpha 原型工具；
- `tests/unit/tools/` 下的合成图 RED/GREEN 测试；
- `experiments/local_alpha/` 下的 README 与 schema/example；
- `docs/feasibility/` 下的本地模型许可证／来源审计；
- 被忽略的 `var/models/` 和 `var/phase-1b/` 私有运行证据。

未经新的书面批准，不修改 Web/API 路由、Phase 0 公共合同、Phase 2 管线、Phase 3
编辑器或后续互动／导出代码。

## 12. 与总体路线的衔接

Phase 1B PASS 后仍留在 Phase 1。随后必须把已验证的本地前景合成方法扩展到三只
外观不同的猫，并完成原 Phase 1 要求的身份、姿势、六部件、恢复、时间和三评审
硬门禁。

当前“不使用 API Key、由 Codex 在开发期人工生成图片”的路线只能作为私有视觉
研究输入，不能伪装成生产 `GenerationProvider` 的幂等与恢复能力证明。若继续坚持
无付费 Provider，可继续完成本地感知与透明合成研究，但 Phase 2 的真实生成管线仍
保持停线；必须另行批准 Provider 替代方案后才能解除。
