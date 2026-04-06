# Mercury Extension vs Pi Extension 比较分析

---

## 📋 执行摘要

| 维度 | Mercury Extension | Pi Extension | 结论 |
|------|------------------|--------------|------|
| **定位** | Agent 管理和调度扩展 | Agent 运行时扩展 | 完全不同 |
| **复杂度** | 高（Docker 构建、权限、多 workspace） | 中（纯运行时） | Mercury 更复杂 |
| **必要性** | ⚠️ 对于企业定制场景可能过度 | ✅ 核心功能 | Pi 必需 |
| **删除可行性** | ✅ 可删除，简化架构 | ❌ 不可删除 | 建议删除 Mercury |

---

## 一、架构定位对比

### Mercury Extension

**定位**: Agent 管理和调度框架的扩展机制

```
┌─────────────────────────────────────────────────────────────┐
│  Mercury (Agent Manager)                                    │
│  ├── Extension System (管理级扩展)                          │
│  │   ├── Docker 镜像构建                                    │
│  │   ├── 权限控制 (RBAC)                                    │
│  │   ├── 多 Workspace 管理                                  │
│  │   ├── 定时任务 (Host 级)                                 │
│  │   └── 环境变量注入                                       │
│  │                                                          │
│  └── Runtime                                                │
│      └── Spawns pi subprocess                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Pi (Agent Runtime)                                         │
│  └── 执行具体任务                                           │
└─────────────────────────────────────────────────────────────┘
```

**设计目标**:
- 支持多租户（不同 workspace 不同配置）
- 支持权限隔离（admin vs member）
- 支持动态扩展（Docker 镜像构建）
- 支持企业定制（多品牌、多配置）

---

### Pi Extension

**定位**: LLM Agent 运行时的扩展机制

```
┌─────────────────────────────────────────────────────────────┐
│  Pi (Agent Runtime)                                         │
│  ├── Extension System (运行时扩展)                          │
│  │   ├── 注册 LLM Tools                                     │
│  │   ├── 拦截 Agent 事件 (before_agent_start, etc.)         │
│  │   ├── 自定义 UI 组件                                     │
│  │   ├── 注册 Slash Commands                                │
│  │   └── 修改 System Prompt                                 │
│  │                                                          │
│  └── LLM Loop                                               │
│      └── 与模型交互                                         │
└─────────────────────────────────────────────────────────────┘
```

**设计目标**:
- 扩展 Agent 能力（新 tools）
- 拦截和修改 Agent 行为
- 自定义用户界面
- 会话管理增强

---

## 二、功能对比

### Mercury Extension 功能清单

| 功能 | API | 用途 | 复杂度 |
|------|-----|------|--------|
| **CLI 安装** | `mercury.cli()` | 在 Docker 镜像中安装 CLI 工具 | 高 |
| **权限控制** | `mercury.permission()` | 定义 Extension 的访问权限 | 高 |
| **环境变量** | `mercury.env()` | 注入环境变量到容器 | 中 |
| **Skills** | `mercury.skill()` | 安装 pi skill | 低 |
| **生命周期 Hook** | `mercury.on()` | 监听 Mercury 事件 | 中 |
| **定时任务** | `mercury.job()` | Host 级后台任务 | 中 |
| **配置管理** | `mercury.config()` | Per-workspace 配置 | 中 |
| **Dashboard** | `mercury.widget()` | Web dashboard 组件 | 低 |
| **持久化存储** | `mercury.store` | Extension 状态存储 | 低 |

**事件类型**:
```typescript
interface MercuryEvents {
  startup: StartupEvent;              // Mercury 启动
  shutdown: ShutdownEvent;            // Mercury 关闭
  workspace_init: WorkspaceInitEvent; // Workspace 创建
  before_container: BeforeContainerEvent;  // pi 启动前
  after_container: AfterContainerEvent;    // pi 结束后
}
```

---

### Pi Extension 功能清单

| 功能 | API | 用途 | 复杂度 |
|------|-----|------|--------|
| **注册 Tools** | `pi.registerTool()` | LLM 可调用的工具 | 高 |
| **生命周期 Hook** | `pi.on()` | 监听 Agent 事件 | 高 |
| **UI 组件** | `pi.ui.*` | 对话框、通知、widget | 高 |
| **注册命令** | `pi.registerCommand()` | Slash commands | 中 |
| **注册快捷键** | `pi.registerShortcut()` | 键盘快捷键 | 低 |
| **注册 CLI 参数** | `pi.registerFlag()` | 命令行参数 | 低 |
| **自定义渲染** | `pi.registerMessageRenderer()` | 消息渲染 | 中 |
| **会话管理** | `pi.sendMessage()` | 发送自定义消息 | 中 |
| **模型管理** | `pi.setModel()` | 切换模型 | 中 |
| **Provider 注册** | `pi.registerProvider()` | 自定义 API provider | 高 |

**事件类型** (50+):
```typescript
type ExtensionEvent =
  | ResourcesDiscoverEvent      // 资源发现
  | SessionStartEvent           // 会话启动
  | SessionBeforeCompactEvent   // 压缩前
  | ContextEvent                // 上下文修改
  | BeforeAgentStartEvent       // Agent 启动前
  | AgentEndEvent               // Agent 结束
  | ToolCallEvent               // 工具调用
  | ToolResultEvent             // 工具结果
  | InputEvent                  // 用户输入
  // ... 50+ 事件类型
```

---

## 三、代码复杂度对比

### Mercury Extension 代码量

```
src/extensions/
├── types.ts           (450 行)   - 类型定义
├── api.ts             (150 行)   - API 实现
├── loader.ts          (200 行)   - Extension 加载
├── hooks.ts           (150 行)   - Hook 分发
├── jobs.ts            (100 行)   - 定时任务
├── skills.ts          (100 行)   - Skill 安装
├── state-service.ts   (100 行)   - 状态存储
├── image-builder.ts   (100 行)   - Docker 镜像构建
├── entity.ts          (50 行)    - 数据库 schema
├── reserved.ts        (20 行)    - 保留名称
└── types.ts           (450 行)   - 类型定义
────────────────────────────────────────────
总计：~1800 行
```

**依赖的数据库表**:
```sql
CREATE TABLE extension_state (
  workspace_id INTEGER,
  extension TEXT,
  key TEXT,
  value TEXT,
  PRIMARY KEY (workspace_id, extension, key)
);
```

**依赖的服务**:
- `ExtensionStateService` - 状态存储
- `RoleService` - 权限控制
- `ConfigService` - 配置管理
- `ImageBuilder` - Docker 构建

---

### Pi Extension 代码量

```
node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/
├── types.d.ts         (1200 行)  - 类型定义
├── runner.ts          (400 行)   - Extension 运行
├── loader.ts          (300 行)   - Extension 加载
├── wrapper.ts         (200 行)   - 工具包装
└── index.ts           (50 行)    - 导出
────────────────────────────────────────────
总计：~2150 行 (编译后)
```

**示例 Extension**:
```typescript
// examples/extensions/pirate.ts (50 行)
export default function pirateExtension(pi: ExtensionAPI) {
  let pirateMode = false;
  
  pi.registerCommand("pirate", {
    description: "Toggle pirate mode",
    handler: async (_args, ctx) => {
      pirateMode = !pirateMode;
      ctx.ui.notify(pirateMode ? "Arrr!" : "Landlubber!", "info");
    },
  });
  
  pi.on("before_agent_start", async (event) => {
    if (pirateMode) {
      return {
        systemPrompt: event.systemPrompt + "\nSpeak like a pirate!"
      };
    }
  });
}
```

---

## 四、内在联系分析

### 关系图

```
┌─────────────────────────────────────────────────────────────┐
│  Mercury Extension                                          │
│  (管理级扩展)                                               │
│                                                             │
│  before_container Hook                                      │
│    ↓                                                        │
│  注入 systemPrompt                                          │
│  注入 environment variables                                 │
│    ↓                                                        │
│  传递给 pi subprocess                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ --append-system-prompt
                              │ --env
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Pi Extension                                               │
│  (运行时扩展)                                               │
│                                                             │
│  before_agent_start Hook                                    │
│    ↓                                                        │
│  修改 systemPrompt (叠加)                                   │
│  注册 Tools                                                 │
│  拦截 Agent 行为                                             │
│    ↓                                                        │
│  调用 LLM                                                    │
└─────────────────────────────────────────────────────────────┘
```

### 功能重叠

| 功能 | Mercury | Pi | 说明 |
|------|---------|----|------|
| **System Prompt 注入** | ✅ `before_container` | ✅ `before_agent_start` | 两者都可以，Mercury 在 Pi 外层 |
| **环境变量** | ✅ `mercury.env()` | ❌ | 仅 Mercury 需要（Docker 容器） |
| **Tools** | ❌ | ✅ `pi.registerTool()` | 仅 Pi 提供 |
| **UI 交互** | ❌ | ✅ `pi.ui.*` | 仅 Pi 提供 |
| **定时任务** | ✅ `mercury.job()` | ❌ | Mercury 在 Host 级运行 |
| **权限控制** | ✅ RBAC | ❌ | Mercury 专有 |

---

## 五、使用场景对比

### Mercury Extension 适用场景

| 场景 | 必要性 | 说明 |
|------|--------|------|
| **多租户 SaaS** | ✅ 必需 | 不同客户不同配置 |
| **企业多品牌** | ✅ 必需 | 品牌隔离 |
| **权限隔离** | ✅ 必需 | admin vs member |
| **动态 CLI 工具** | ⚠️ 可选 | 根据 Extension 安装 |
| **Host 级任务** | ⚠️ 可选 | 定时清理、报告 |
| **单一企业定制** | ❌ 不必要 | 过度设计 |

---

### Pi Extension 适用场景

| 场景 | 必要性 | 说明 |
|------|--------|------|
| **自定义 Tools** | ✅ 必需 | 扩展 Agent 能力 |
| **修改 Agent 行为** | ✅ 必需 | 拦截事件 |
| **UI 定制** | ✅ 必需 | 交互式界面 |
| **会话管理** | ✅ 必需 | 自定义消息 |
| **企业定制** | ✅ 必需 | 品牌特定行为 |
| **多租户** | ✅ 必需 | 运行时隔离 |

---

## 六、删除 Mercury Extension 的影响分析

### ✅ 可以删除的功能

| 功能 | 替代方案 | 影响 |
|------|---------|------|
| **CLI 安装** | 固定 Dockerfile | 无（企业场景 CLI 固定） |
| **权限控制** | 简化为 admin/member | 低（企业场景权限简单） |
| **环境变量** | .env 文件 | 低（配置固定） |
| **定时任务** | 外部 cron | 低（可迁移） |
| **Dashboard** | 移除 | 低（少用） |
| **Extension State** | 直接数据库访问 | 低（内部使用） |

---

### ❌ 需要保留的功能

| 功能 | 原因 | 迁移方案 |
|------|------|---------|
| **Workspace 管理** | 多用户隔离必需 | 保留核心逻辑 |
| **Auto-pair** | 零配置 onboarding | 保留核心逻辑 |
| **Skills 安装** | pi skill 必需 | 简化为固定路径 |
| **before_container Hook** | systemPrompt 注入 | 简化为配置读取 |

---

### ⚠️ 需要迁移到 Pi Extension 的功能

| 功能 | 迁移方案 |
|------|---------|
| **System Prompt 注入** | 使用 pi `before_agent_start` Hook |
| **自定义行为** | 使用 pi `registerTool()` 和 events |
| **UI 交互** | 使用 pi `ui.*` API |

---

## 七、简化后的架构建议

### 当前架构（复杂）

```
mercury-ai/
├── Extension System (1800 行)
│   ├── CLI 安装
│   ├── 权限控制
│   ├── 定时任务
│   ├── Dashboard
│   └── State Store
├── Workspace 管理
└── Pi Subprocess 管理
```

### 简化后架构（推荐）

```
mercury-ai/
├── Workspace 管理 (保留)
│   ├── Auto-pair
│   ├── 多 workspace 隔离
│   └── 配置加载
├── Pi Subprocess 管理 (保留)
│   ├── 启动 pi
│   └── 传递配置
└── 配置系统 (简化)
    ├── workspaces/AGENTS.md
    └── .env
```

**删除的组件**:
- ❌ Extension 加载器
- ❌ Extension API
- ❌ Hook 分发器
- ❌ 定时任务系统
- ❌ Dashboard widget
- ❌ Extension State Store
- ❌ CLI 安装机制
- ❌ 权限系统（简化为固定角色）

---

## 八、迁移路径

### 阶段 1: 冻结 Extension 系统

```bash
# 不再开发新的 Mercury Extension
# 文档标记为"已弃用"
```

### 阶段 2: 迁移必要功能

| 功能 | 迁移目标 |
|------|---------|
| System Prompt 注入 | Pi `before_agent_start` |
| 定时任务 | 外部 cron 或 systemd timer |
| Dashboard | 移除或独立项目 |
| CLI 工具 | 固定在 Dockerfile |

### 阶段 3: 删除代码

```bash
# 删除 src/extensions/ 目录
# 删除相关数据库表
# 删除相关 API 端点
```

### 阶段 4: 简化文档

```bash
# 更新文档说明 Mercury 是"Agent 运行时管理器"
# 删除 Extension 相关文档
# 添加 Pi Extension 使用指南
```

---

## 九、风险评估

### 删除 Mercury Extension 的风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **现有 Extension 失效** | 中 | 提前通知，提供迁移指南 |
| **功能缺失** | 低 | 评估实际使用情况 |
| **用户困惑** | 中 | 清晰文档说明 |
| **代码回归** | 低 | 充分测试 |

### 保留 Mercury Extension 的风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **架构复杂** | 高 | 持续维护成本高 |
| **学习曲线** | 高 | 用户难以理解 |
| **潜在 Bug** | 中 | 更多代码 = 更多 Bug |
| **定位模糊** | 高 | 用户不知道用哪个 |

---

## 十、结论和建议

### 核心结论

1. **Mercury Extension 和 Pi Extension 定位完全不同**
   - Mercury = 管理级扩展（Docker、权限、多租户）
   - Pi = 运行时扩展（Tools、UI、Agent 行为）

2. **对于企业定制场景，Mercury Extension 是过度设计**
   - 单一客户不需要多租户隔离
   - 权限模型可以简化
   - 动态 CLI 安装不必要

3. **Pi Extension 是必需的核心功能**
   - 提供 Agent 能力扩展
   - 拦截和修改 Agent 行为
   - 无法替代

### 最终建议

**删除 Mercury Extension 系统，保留核心管理功能**

```
保留:
✅ Workspace 管理
✅ Pi Subprocess 管理
✅ 配置加载（AGENTS.md, .env）
✅ Auto-pair

删除:
❌ Extension 加载器
❌ Hook 系统
❌ 定时任务
❌ Dashboard
❌ State Store
❌ CLI 安装
❌ 权限系统（简化）
```

### 简化后的使用流程

```bash
# 1. 创建项目
mkdir agentxx && cd agentxx
mercury init

# 2. 配置 Agent
vi workspaces/AGENTS.md      # Agent 配置
vi .env                       # 环境变量
vi Dockerfile                 # Docker 配置

# 3. 添加 Pi Extension（可选）
mkdir .pi/extensions
vi .pi/extensions/my-ext.ts   # Pi Extension

# 4. 构建运行
mercury build
mercury start
```

**复杂度降低**:
- 代码量：-1800 行
- 数据库表：-1 个
- API 端点：-10 个
- 文档页面：-5 个
- 学习曲线：显著降低

---

## 附录：代码引用分析

### Mercury Extension 被引用的地方

```bash
$ grep -r "from.*extensions" src/ --include="*.ts" | grep -v ".test.ts"

src/main.ts                    # 加载 Extension
src/core/runtime/runtime.ts    # 使用 Hook
src/cli/commands/build.ts      # Docker 构建
src/extensions/loader.ts       # 加载器本身
src/extensions/api.ts          # API 实现
# ... 约 20 个文件
```

### 删除影响范围

| 文件类型 | 数量 | 处理方式 |
|---------|------|---------|
| Extension 核心 | 10 | 删除 |
| 使用 Extension | 20 | 简化 |
| 测试文件 | 15 | 删除 |
| 文档 | 5 | 更新 |
| **总计** | **~50** | **2 周工作量** |

---

## 总结

**Mercury Extension 是为了通用 SaaS 场景设计的，但对于企业定制 Agent 场景是过度设计。**

**建议删除 Mercury Extension 系统，专注于：**
1. Workspace 管理（多用户隔离）
2. Pi Subprocess 管理（运行时）
3. 配置系统（AGENTS.md, .env）

**Pi Extension 保留作为 Agent 能力扩展机制。**
