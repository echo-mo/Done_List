# Role
你是一位精通 Full-stack 开发的资深架构师，拥有极高的 UI/UX 审美。你擅长使用原生 JS/CSS 或主流框架（React/Vue）实现高性能的交互动画，并能处理复杂的响应式适配与 MongoDB 聚合查询。

# Context & Project Background
本项目是一个已在 Zeabur 部署的任务管理工具，后端使用 Node.js + MongoDB。

核心数据结构：严格遵守 { date: "YYYY-MM-DD", content: "String", status: "done/undo" }。

物理路径参考：/Users/wangyihui.22/Desktop/code/1/my_vibe_html/ 包含 ARCHITECTURE.md 和 DATA_DICTIONARY.md。

当前现状：已实现基础 CRUD、名言展示、热力图初步展示。

# Task 1: 交互重构 —— 工业级侧滑编辑与删除系统 (Swipe Actions)
当前的编辑（Edit）逻辑存在严重错误，请按以下标准重构：

交互模型与视觉反馈：

向右滑动 (Swipe Right)：平滑露出蓝色/紫色背景的“编辑 (Edit)”按钮（带铅笔图标）。

向左滑动 (Swipe Left)：平滑露出红色背景的“删除 (Delete)”按钮（带垃圾桶图标）。

状态机与编辑模式转换：

点击“Edit”按钮后，任务文本立即切换为 Input 框，并自动聚焦 (Auto-focus)。

退出机制 (Exit Strategy)：

在编辑框右侧显示“保存”和“取消”图标。

增强交互：在编辑模式下，向左滑动任务块应触发“取消并退出编辑”逻辑。

技术约束：

必须使用 CSS transform: translateX 和 will-change 属性确保 60fps 的滑动流畅度。

增加防误触逻辑：设置滑动阈值（如 >30px 才触发），确保用户在上下滚动页面时不会意外触发侧滑。

# Task 2: 视觉体系 —— HSL 极简冷紫色系方案 (Color System)
统一全站色调，消除“偏红紫色”和“脏灰色”：

色相约束 (Hue Control)：固定在偏蓝紫色区间（Hue: 250-265）。

热力图 5 级梯度设计：

Level 0 (无任务/最低级)：由灰色改为极浅紫色（建议 hsl(255, 35%, 95%)），确保背景通透且有呼吸感。

Level 1-4 (任务密度增加)：保持色相不变，线性增加饱和度 (S)，降低明度 (L)。

视觉标准：各级别之间对比度明显，但整体色调和谐，不产生视觉疲劳。

列表样式全局统一：

未完成任务：无边框，填充颜色 = 热力图 Level 0 的浅紫色。

已完成任务：无边框，填充颜色 = 极浅灰色（如 #f5f5f5），必须取消删除线，仅通过文字颜色减淡和背景色区分。

# Task 3: 逻辑优化 —— 线性热力图与双端布局 (Data Viz)

时间轴线性对应：

热力图点阵展示的时长必须与用户选择的查询时间段【完全一致】，严禁以年为单位进行强制截断。

周索引数学逻辑：

每行固定 7 个点位。必须使用 JS new Date().getDay() 准确计算偏移量：周一固定在最左，周日固定在最右。

响应式深度适配：

桌面端 (Desktop)：采用 Flex-row。左侧显示点阵，右侧展示详情。点击点阵某一天，右侧列表无刷新更新。

移动端 (Mobile)：热力图点阵 width: 100% 自适应屏幕宽度。点击点阵后，从屏幕底部弹出（Bottom Sheet）或在点阵下方优雅展开当日任务。

# Constraints & Standards (开发规范)

数据规则：严禁引入 create_at 或 updated_at 等额外字段，所有逻辑基于 date 字段。

持久化：除非用户手动执行 Delete 接口，否则数据永久保存。

严禁擅自决定：若遇到变量名冲突或 API 路径不明确，必须挂起任务并询问我，禁止盲目猜测。

# Deliverables (交付物)

核心代码块：包含侧滑交互的 CSS/JS、HSL 变量定义、以及 MongoDB $project 和 $group 聚合查询代码。

文档同步更新：根据改动内容，更新 ARCHITECTURE.md（交互逻辑部分）和 DATA_DICTIONARY.md（UI 状态字段）。

验证报告：说明如何验证“左右滑动不冲突”以及“跨月热力图对齐”的准确性。