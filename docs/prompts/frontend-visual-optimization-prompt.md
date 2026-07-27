# 多宠物前端视觉优化 Prompt

将下面内容直接复制给能够读取并修改本地代码的大模型：

```text
请直接优化这个 2D 像素宠物前端的视觉设计与响应式体验：

项目路径：
/Users/chy/Desktop/xyf_projects/.worktrees/interactive-pixel-dog

开始前请阅读：
- docs/product/multi-pet-frontend-design-features.md
- docs/product/interactive-pixel-dog-feature-spec.md
- docs/qa/multi-pet-scenes-interactions-qa.json

设计方向：
- 做成温暖、精致、真正可玩的像素宠物小世界，不要像 SaaS 后台。
- 宠物始终是最强视觉焦点，场景丰富但不能抢主体。
- 优化宠物/场景选择、状态提示、操作按钮、空间层级和移动端首屏。
- 桌面端 1440×900 内应看到舞台和主要操作；移动端 390×844 应优先看到宠物与互动。
- 保持统一的像素感、配色、间距、边框、阴影和按钮反馈。

必须保留：
- 5 只宠物、6 个场景、全部 14 个状态和现有互动。
- 所有宠物/场景资产、精灵图合同、等待与睡眠规则、舞台边界。
- 鼠标、触摸、长按、键盘、焦点、aria-live 和 reduced-motion 支持。
- 不加入 3D、上传、账号、商城、大型依赖或远程资源。

请先检查当前页面和 git 状态，然后直接实施一个统一方案，不要只给建议。
完成后检查 1440×900、578×863、390×844，确认无横向溢出、道具不越界，
并运行 Web 测试、typecheck 和生产构建。最后简要说明修改文件、视觉改进
和验证结果。
```
