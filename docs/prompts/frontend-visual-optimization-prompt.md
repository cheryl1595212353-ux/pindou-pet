# 豆包前端视觉优化 Prompt

## 使用方式

将下面代码块中的全部内容原样复制给能够读取和修改本地代码的模型。

建议让模型在以下工作树中工作：

`/Users/chy/Desktop/xyf_projects/.worktrees/interactive-pixel-dog`

## 可直接复制的 Prompt

```text
你是一名资深产品设计师、交互设计师和 React 前端工程师。请直接审查并优化一个已经可以运行的 2D 互动像素宠物产品。你的任务不是重新做功能，也不是只给设计建议，而是在保留现有行为和资产合同的前提下，实际修改前端代码，让页面在桌面端和移动端都更精致、更有角色感、更像一个完成度高的像素宠物产品。

项目位置：
/Users/chy/Desktop/xyf_projects/.worktrees/interactive-pixel-dog

基线分支：
codex/interactive-pixel-dog

功能基线提交：
5c77fdf

技术栈：
- React 19
- TypeScript
- Vite
- 原生 CSS
- CSS background-position 精灵图动画

开始前必须先阅读：
1. docs/product/interactive-pixel-dog-feature-spec.md
2. docs/superpowers/specs/2026-07-27-interactive-pixel-dog-design.md
3. docs/qa/interactive-pixel-dog-qa.json
4. apps/web/src/app/pixel-dog/PixelDogStudio.tsx
5. apps/web/src/app/pixel-dog/pixelDogModel.ts
6. apps/web/src/app/styles.css
7. apps/web/public/pixel-dog/doubao/pet.json

主要素材：
- apps/web/public/pixel-dog/doubao/base.png
- apps/web/public/pixel-dog/doubao/spritesheet.webp
- apps/web/public/pixel-dog/doubao/real-reference.png

当前产品已经具备以下功能，必须全部保留：
- 空闲时呼吸和眨眼；
- 12 秒无操作后等待；
- 30 秒无操作后睡觉；
- 左右方向键和左右按钮移动；
- 单击豆包后开心回应；
- 长按或拖动豆包后进入抚摸回应；
- 跳跃；
- 喂食并显示食盆；
- 叫醒；
- 当前状态的 aria-live 文字反馈；
- 图集加载失败提示；
- prefers-reduced-motion 支持；
- 舞台左右边界限制；
- 桌面和移动端响应式布局。

固定资产和技术合同，禁止破坏：
- 不得替换、重新生成、重绘或修改豆包的图片资产；
- 不得改变 spritesheet.webp 的 1536×1872 尺寸；
- 不得改变 8 列 × 9 行、单元格 192×208 的图集合同；
- 不得改变九个产品状态与图集行的映射；
- 不得改变等待 12 秒、睡眠 30 秒的业务规则；
- 不得把左右动画改成运行时镜像；
- 不得删除键盘、触摸、长按、焦点或 reduced-motion 支持；
- 不得引入 Three.js、WebGL、3D、体素或 AR；
- 不得修改旧的 3D 文件；
- 不得修改后端；
- 不得添加账号、上传、商店、成长系统等新产品功能；
- 不得为了视觉效果引入大型前端依赖；
- 不得依赖远程字体、CDN 图片或运行时网络资源。

优先允许修改的文件：
- apps/web/src/app/pixel-dog/PixelDogStudio.tsx
- apps/web/src/app/styles.css
- apps/web/src/app/router.tsx
- apps/web/index.html
- 对应的前端测试文件

原则上不要修改：
- apps/web/src/app/pixel-dog/pixelDogModel.ts
- apps/web/public/pixel-dog/doubao/*
- apps/web/src/app/voxel/*
- apps/api/*

如果你认为必须修改原则上不应修改的文件，请先说明必要性，并确保修改只服务于视觉和可用性，不改变功能合同。

当前视觉基础：
- 暖米白、木色和青绿色组成的克制配色；
- 左侧角色说明，右侧像素房间；
- 房间包含窗户、置物架、墙面网格和地板；
- 控件位于房间底部；
- 整体偏编辑器式、卡片较少、边框硬朗；
- 豆包是页面唯一主角。

当前需要重点改善的问题：
1. 桌面房间中部留白偏多，环境层次和生活感还不够，但不能靠堆装饰解决。
2. 移动端首屏的标题和介绍占用空间较大，豆包和核心操作出现得太晚；移动端应该更“舞台优先”。
3. 当前状态提示在介绍区内，移动端可能离豆包较远；需要让状态与角色建立更直接的视觉联系。
4. 操作按钮功能清楚，但层级、分组和按下反馈还可以更像一个完成度高的像素游戏控制区。
5. 窗户、置物架、地板和豆包之间的空间关系可以更统一，但豆包不能被遮挡。
6. 页面需要更强的第一眼记忆点，同时保持克制，不要变成营销落地页。

设计目标：
- 用一句明确的视觉 thesis 统领页面，例如“温暖的掌机像素宠物房间，安静、可信、略带玩具质感”；
- 豆包必须是首屏最强视觉焦点；
- 页面看起来像真正可玩的宠物空间，而不是 SaaS 仪表盘；
- 信息层级清楚，文案精简，状态和操作容易扫描；
- 桌面端 1440×900 下，豆包、状态和主要控件无需纵向滚动即可使用；
- 移动端 390×844 下优先展示豆包舞台，避免用户先滚过一整屏说明文字；
- 578×863 的 Codex 内置浏览器视口下不得出现横向溢出；
- 所有主要触摸控件至少约 44px 高；
- 豆包移动到 8% 或 92% 边界时不能被不合理裁切；
- 喂食状态下食盆必须与豆包位置协调；
- 状态切换不能引发明显布局跳动；
- 颜色、阴影、边框和字体必须形成统一系统；
- 焦点样式、颜色对比和可读性不能退化。

前端艺术方向要求：
- 先从整体构图、留白、比例和视觉焦点入手，再处理按钮细节；
- 保持一个主要强调色，优先延续青绿色；
- 最多使用两个字体系统，优先系统字体和等宽字体；
- 避免卡片矩阵、统计卡片、玻璃拟态、霓虹渐变、紫蓝渐变和无意义装饰；
- 避免把每个区域都加粗边框或阴影；
- 不要使用 emoji 作为主要图标；
- 不要添加与功能无关的营销文案；
- 不要用装饰遮挡豆包；
- 可以使用 CSS 形状、纯 CSS 像素装饰和轻量纹理，但必须服务于房间氛围和交互可读性；
- 不需要生成任何新图片。

动效要求：
- 保留现有精灵图动画；
- 可以增加 2 至 3 个克制的界面动效，例如舞台进入、状态文字切换、按钮按压或房间微弱环境变化；
- 动效必须快速、清楚、不会抢过豆包；
- 所有新增动效必须在 prefers-reduced-motion 下关闭或显著简化；
- 不要引入动画库，除非仓库已经依赖且能明确证明必要性。

执行流程：
1. 先检查 git status，保留所有不属于本任务的现有修改。
2. 启动当前页面并分别查看桌面端与移动端。
3. 在写代码前输出三项简短内容：
   - visual thesis
   - content plan
   - interaction thesis
4. 给出当前页面最重要的 3 至 5 个视觉问题，并说明你的修改策略。
5. 直接实施一个统一方案，不要同时堆出多个互相冲突的主题。
6. 修改范围保持克制，优先使用现有组件和 CSS。
7. 如果改变 DOM 结构或可访问名称，同步更新测试。
8. 完成后实际操作点击、跳跃、喂食、移动、等待、睡眠和叫醒流程。

必须运行：
export PATH=/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH
pnpm --filter @pindou/web test
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build

视觉验收视口：
- 1440×900
- 390×844
- 578×863

视觉验收标准：
- 豆包身份和像素清晰度没有变化；
- 三个视口均无横向滚动；
- 移动端优先看到豆包和互动，不再由大段介绍占据首屏；
- 桌面端没有大面积无目的空白；
- 状态、豆包和控件形成一个清楚的操作闭环；
- 点击、长按、移动、跳跃、喂食、睡眠和叫醒均可用；
- 键盘焦点清楚；
- reduced-motion 行为正常；
- 控制台没有错误；
- 测试、类型检查和构建全部通过。

完成后的输出格式：
1. 最终视觉 thesis；
2. 修改了哪些文件；
3. 每个关键视觉修改解决了什么问题；
4. 三个视口的实际检查结果；
5. 交互回归结果；
6. 测试、类型检查和构建结果；
7. 仍然存在但未擅自扩展处理的限制。

不要只输出建议或示例代码。请在当前工作树中完成修改、验证，并给出可审查的最终结果。
```

