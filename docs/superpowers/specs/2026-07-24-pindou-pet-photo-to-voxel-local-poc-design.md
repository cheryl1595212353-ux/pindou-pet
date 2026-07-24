# 拼豆宠物单张照片转体素猫本地 POC 设计

日期：2026-07-24
状态：方案 A 已批准，待书面规格复核

## 1. 目标

在不接入现有网页、不部署服务器、不修改现有三视图体素代码的前提下，验证下面这条完全本地的单图链路：

`cat-01/front.png → rembg → photo2pixel → 58×58 RGBA PNG → GazPrash Single → OBJ`

本轮只回答两个问题：

1. 现有猫照片能否生成轮廓和主要花色可辨认的二维像素图；
2. 该 58×58 像素图通过 Single 模式生成的 OBJ，是否达到可旋转查看的体素猫原型标准。

Single 模式无法恢复照片中不存在的侧面与背面信息。本轮允许模型侧后方为近似厚度，但不会把它描述为真实 360° 重建。

## 2. 隔离范围

- 固定输入为 `apps/web/public/demo-cats/cat-01/front.png`，不开发摄像头采集和照片上传。
- 所有运行媒体、模型缓存、第三方源码和报告写入被 Git 忽略的 `var/photo-to-voxel-poc/`。
- 当前 React、Three.js、FastAPI 和三视图视觉外壳代码保持不变。
- 不把第三方仓库源码复制进产品源码，不提交模型权重、私人照片或生成的 OBJ。
- 只新增可复现的本地编排脚本、轻量验证脚本、依赖锁定说明和实验报告模板。

## 3. 第三方组件

固定使用以下上游项目，并在实验 manifest 中记录实际检出的 commit、许可证和运行版本：

- `danielgatis/rembg`：生成透明前景；
- `Jzou44/photo2pixel`：生成像素风图像；
- `GazPrash/2d-to-3d-voxelizer`：Single 模式生成 OBJ。

Python 处理环境固定为 Python 3.12。rembg 首轮使用 CPU 推理；photo2pixel 优先使用上游 ONNX 推理入口，只有其当前提交无法运行时才回退到上游 PyTorch 入口。GazPrash 优先使用可复现的源码构建；若 macOS 构建被上游依赖阻断，可使用官方 Apple Silicon 发布包完成人工导出，但必须在报告中标记为人工步骤。

## 4. 数据流与输出契约

### 4.1 原始输入

输入必须是完整可读的 PNG。运行开始时记录相对路径、宽高、颜色模式和 SHA-256。

### 4.2 去背景

rembg 输出：

- `02-foreground.png`：保留原分辨率的 RGBA 透明前景；
- `03-mask.png`：与原图同尺寸的二值掩码。

掩码只保留最大的主体连通分量。透明区 alpha 为 0，主体区 alpha 为 255，不保留半透明背景边缘。

### 4.3 像素化与 58×58 规范化

photo2pixel 的结果先保持自身输出尺寸，再使用前景掩码去除背景。随后按前景包围盒等比缩放、水平居中、脚底对齐到 58×58 透明画布，缩放固定使用最近邻。

固定输出：

- `04-photo2pixel-raw.png`：上游原始像素化结果；
- `05-pixel-58.png`：精确 58×58、RGBA、二值 alpha、最多 24 个不透明 RGB 颜色；
- `06-pixel-preview-464.png`：`05` 的 8 倍最近邻预览。

首轮禁止抖色。若上游默认产生超过 24 色，使用确定性的无抖色调色板量化到 24 色。

### 4.4 体素化

GazPrash Single 模式只接收 `05-pixel-58.png`。首轮保留默认厚度，再额外导出浅、深两个对照档；如果当前上游界面没有独立厚度参数，则只导出默认档并在报告中记录该限制。

输出 OBJ 必须位于：

- `07-voxel-default.obj`；
- 可选 `07-voxel-shallow.obj`；
- 可选 `07-voxel-deep.obj`。

对应 MTL 或纹理文件与 OBJ 同目录保存。最终用本地查看器生成正面、侧面和三分之四视角截图。

## 5. 本地编排

提供一个从仓库根目录运行的命令，完成除 GazPrash 桌面导出之外的确定性步骤：

```bash
python scripts/photo_to_voxel_poc/run_pipeline.py
```

脚本依次执行输入审计、rembg、photo2pixel、58×58 规范化、PNG 验证和 manifest 生成。任何阶段失败都立即停止，不使用静默回退结果冒充成功。

若 GazPrash 暂时只能人工操作，报告中必须给出准确的输入文件、选择模式、参数和导出路径；后续只有在质量门槛通过后，才评估提取 Go 核心实现全自动化。

## 6. 验证与验收

自动验证必须检查：

- 输入和每个 PNG 可解码；
- `05-pixel-58.png` 精确为 58×58 RGBA；
- alpha 仅包含 0 和 255；
- 不透明颜色数不超过 24；
- 至少存在一个不透明像素，主体未贴出画布；
- 最大主体连通分量占不透明像素至少 98%；
- `06-pixel-preview-464.png` 精确为 464×464，并与 `05` 最近邻逐块一致；
- OBJ 存在顶点和面，索引合法且模型边界非零。

人工验收必须同时查看原图、透明前景、58×58 预览和 OBJ 三视角：

- 58×58 图能辨认猫的头、耳、身体、腿和尾巴；
- 主要深浅花色仍能与原猫对应；
- 没有明显背景块和游离噪点；
- OBJ 可正常打开、旋转，正面与二维像素图基本一致；
- 侧后方若扁平，明确记录为 Single 模式的信息限制。

## 7. 失败分支

- rembg 已破坏耳朵、腿或尾巴：停止，不进入像素化；
- 二维图不可辨认：只调整裁切、photo2pixel 参数或调色板，不调整 3D；
- 二维图合格但 OBJ 侧后方不可接受：判定 Single 路线不足，停止继续微调，下一规格改为四视图加 GazPrash Quad；
- GazPrash 无法在本机运行：保留已通过验证的 58×58 资产和完整错误证据，不改用未经确认的体素算法冒充结果。

## 8. 交付物

实验目录最终包含：

```text
01-original-cat.png
02-foreground.png
03-mask.png
04-photo2pixel-raw.png
05-pixel-58.png
06-pixel-preview-464.png
07-voxel-default.obj
08-voxel-front.png
09-voxel-side.png
10-voxel-three-quarter.png
manifest.json
experiment-report.md
```

OBJ 或截图因上游能力未生成时，不创建占位文件；报告必须明确标记阻断阶段、命令和错误。只有二维和三维验收同时通过，才进入网页集成或服务器化设计。
