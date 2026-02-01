# BandPet — 项目说明

版本：2025-12-26  
语言：中文  
目标设备：小米手环 
类型：快应用 / AIoT（aiot-toolkit）

概述  
BandPet 是面向智能手表的轻量化宠物养成应用。源码位于 `src/`，构建产物在 `dist/`。本 README 作为开发/扩展与代码提交的行动指南。

快速开始
- 安装依赖：
  ```bash
  npm install
  ```
- 本地热重载（开发）：
  ```bash
  npm run start
  ```
- 构建产物：
  ```bash
  npm run build
  ```
- 发布（aiot-toolkit）：
  ```bash
  npm run release
  ```
- 代码风格检查：
  ```bash
  npm run lint
  ```

一、项目结构速览（关键路径）
- src/ — 源码（仅修改此目录）
  - src/manifest.json — 路由与权限（入口 main，deviceTypeList 包含 "watch"）
  - src/app.ux — 全局生命周期与错误/日志入口
  - src/<page>/index.ux — 每个页面视图与页面逻辑（如 more, leaderboard, exchange, market, customize, settings, activate, about, naming）
  - src/common/js/api-service.js — 网络层与后端函数封装（所有后端交互必须通过此模块）
  - src/common/js/config.js — 全局常量与存储键（例如 STORAGE_KEYS、SYNC_INTERVAL、MAX_CLICKS_PER_BATCH）
  - src/common/js/auth.js / auth-guard.js — 鉴权相关
  - src/InputMethod/ — 内置输入法资源（数字键盘、QWERTY）
- BandPet.txt — 激活码 / 设备码算法与视觉规范（必须参照）
- VelaDocs/ — 平台能力文档（优先查阅）

二、核心设计与数据流要点（必须遵守）
- 路由由 `src/manifest.json` 管理；每页由 `src/<page>/index.ux` 提供 UI 与逻辑。
- 所有后端接口必须通过 `src/common/js/api-service.js` 封装调用。不要在页面中直接硬编码 URL 或函数名。
- 全局常量与存储键必须在 `src/common/js/config.js` 中定义（例如 `STORAGE_KEYS.PENDING_CLICKS`）。
- 点击计数（主玩法）：
  - 在内存中累积（例如单例管理器），避免频繁写入 `@system.storage`。
  - 按 `config.js` 中的 `SYNC_INTERVAL`（默认 5 分钟）或达到 `MAX_CLICKS_PER_BATCH` 时批量调用 `ApiService.syncClicks()` 上报。
  - 仅在必要时（切后台、定时 flush、退出）批量写入本地存储作为持久化备份。
- 激活流程：
  - 激活码/设备码校验逻辑来源于项目根 `BandPet.txt`，实现必须与该文件保持一致，位于 `src/activate/index.ux`。
- UI 风格：深色/极简。主界面：黑背景、顶部时间、中间宠物名占位，点击宠物计数，底部左侧更多按钮、右侧胶囊显示点击数。

三、游戏（简要）
- 成长系统
- 连击/Combo
- 日常任务/签到/成就
- 小游戏
- 商城/兑换：
- 排行榜
- 活动系统：限时活动/节日活动

四、网络与 API 规范（必须遵守）
- 在修改或生成网络相关代码前，**必须**打开并参考 `src/common/js/api-service.js`（不要把 README 示例值当真实配置）。
- 如需可配置 base URL，请新增或更新 `src/common/js/network-config.js` 或在 `api-service.js` 顶部声明常量，并在提交说明中记录变更原因与影响范围。
- 新增接口名或后端函数，更新 `api-service.js` 并同步更新 `config.js`（如需要的存储键/超时常量）。

五、实现细节与示例策略（点击上报部分）
- 单例 ClickManager（内存队列）负责：
  - 接收点击事件，更新内存计数与上报触发条件检测
  - 在达到批量阈值或定时器触发时调用 `ApiService.syncClicks(pendingBatch)`
  - 在切后台或页面卸载时触发一次持久化（写入 `STORAGE_KEYS.PENDING_CLICKS`）
- 写 storage 的频率受限，优先内存，必要时批量写入。
- 上报失败需重试策略（指数退避）并保留本地队列。

六、开发与调试注意事项（必读）
- 永远修改 `src/`，不要编辑 `dist/`。
- 遇到平台能力差异（例如 `@system.fetch` 返回结构或权限问题），先在仓库内 VelaDocs 中搜索对应条目再修改代码。
  - 推荐阅读：VelaDocs/VelaDocs-main/docs/zh -> system / network / devicedebug / release
- 日志与错误处理集中在 `src/app.ux`，修改时注意不破坏全局行为。
- 在 PR 中说明：改动目的、变更的 constants（config.js）、API 变更、引用的 VelaDocs 文档页（如有平台相关调整）。

七、测试、CI 与发布
- 若新增逻辑模块（例如 leveling、daily、miniGames），请为核心逻辑编写单元测试并纳入 CI（如果项目已有测试脚本，请参照）。
- 发布前确保：
  - 运行 `npm run lint`
  - 运行单元测试（如有）
  - 本地构建通过 `npm run build`
  - 在提交说明里列出网络/权限变更并引用 `api-service.js` 修改点

八、常见问题与快速排查
- 点击丢失/不上报：检查 ClickManager 队列、SYNC_INTERVAL、MAX_CLICKS_PER_BATCH、`ApiService.syncClicks()` 返回处理和重试逻辑。
- 激活失败：参照 `BandPet.txt` 算法验证输入编码与实现细节。
- 平台差异导致接口异常：先阅读 VelaDocs 相应条目并在代码中增加兼容处理。

附：重要路径提醒
- 激活规则：BandPet.txt（仓库根）—— 必读  
- 网络层：src/common/js/api-service.js —— 修改/新增网络逻辑前必须参考  
- 常量：src/common/js/config.js —— 所有存储键与共享常数放置处  
- 平台文档：VelaDocs/VelaDocs-main/docs/zh（优先）
