# 角色
你是一位资深全栈工程师，擅长 React/Vue 前端、Node.js 后端及 MongoDB 数据库，具备严谨的响应式设计思维。

# 项目背景
我有一个部署在 Zeabur 的任务管理项目，后端使用 MongoDB。当前已有大标题、名言展示、状态栏、输入框、任务列表、查询模块和历史导入功能。
数据结构仅包含三个字段：【日期】(date)、【任务内容】(content)、【任务状态】(status)。
具体内容可以参考/Users/wangyihui.22/Desktop/code/1/my_vibe_html/ARCHITECTURE.md

# 任务需求一：数据去重逻辑 (Data Integrity)
请在前后端同时实现“同日期同名任务去重”：

前端拦截：用户输入时，若当日已存在同名任务，弹出提示并阻止提交。

后端校验：在存入 MongoDB 前检查 (date + content) 的唯一性，确保数据库中同一天内没有重复任务。

# 任务需求二：热力图可视化 (Calendar View)
优化“任务查询”模块，实现双端适配的日历视图：

视觉方案：参考 GitHub 贡献图，使用“热力图点阵”。

颜色逻辑：根据完成率（已完成/总数）显示灰色（无任务）到深绿（全完成）的渐变。

重置逻辑：每年 1 月 1 日年度统计在视图上重置，但历史数据需完整保留在数据库中。

桌面端交互：点阵与列表并排显示。点击点阵中的某一天，侧边列表实时切换为该日任务。

移动端交互：仅显示紧凑点阵。点击日期后，从底部弹出（Bottom Drawer）或在下方展开该日任务详情。

# 数据规则与约束

参考/Users/wangyihui.22/Desktop/code/1/my_vibe_html/DATA_DICTIONARY.md。

字段限制：严格仅保留 date, content, status。

持久化：除手动删除外，数据永久保存；日期不区分创建和完成时间。

# 关键指令

严禁擅自决定：由于架构不完整，如有接口路径或变量名不明确，请务必询问我，不要自行猜测。

代码要求：请提供完整的 CRUD 修改逻辑、响应式 CSS（Media Queries）以及 MongoDB 聚合查询代码。

验证任务：请在代码完成后，说明你如何验证“去重逻辑”和“移动端显示”的有效性。

更新文档：根据更新的内容，判断是否需要更新/Users/wangyihui.22/Desktop/code/1/my_vibe_html/ARCHITECTURE.md和/Users/wangyihui.22/Desktop/code/1/my_vibe_html/DATA_DICTIONARY.md