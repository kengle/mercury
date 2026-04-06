# AGENTS.md 层级架构

Mercury 支持分层级的 AGENTS.md 配置，允许你定义通用的 Agent 能力，同时支持每个 Workspace 的个性化定制。

---

## 目录结构

```
my-mercury-project/
├── workspaces/
│   ├── AGENTS.md              ← Agent 通用配置（所有 workspace 继承）
│   │
│   ├── ws-wecom-user123/
│   │   ├── AGENTS.md          ← 用户 1 特定配置（可选，覆盖/补充通用配置）
│   │   ├── inbox/
│   │   ├── outbox/
│   │   └── ...
│   │
│   ├── ws-wecom-user456/
│   │   ├── AGENTS.md          ← 用户 2 特定配置（可选）
│   │   └── ...
│   │
│   └── ws-wecom-group789/
│       ├── AGENTS.md          ← 群组特定配置（可选）
│       └── ...
```

---

## 配置优先级

pi 在启动时会从当前工作目录向上搜索 AGENTS.md 文件：

```
搜索顺序 (从先到后):
1. workspaces/<workspace-name>/AGENTS.md  ← 当前 workspace (如果存在)
2. workspaces/AGENTS.md                   ← 通用配置 (如果存在)
3. <project-root>/AGENTS.md               ← 项目根目录 (如果存在)
4. ~/.pi/agent/AGENTS.md                  ← 全局配置 (如果存在)
```

**所有找到的 AGENTS.md 内容会被合并**，子目录的配置优先级更高。

---

## 使用场景

### 1. Agent 通用配置 (`workspaces/AGENTS.md`)

定义所有 Workspace 共享的核心能力、限制和品牌定位。

```markdown
# 东锦小智 - Agent 配置

## 身份
你是东锦小智，一个简洁高效的企业数据分析助手。

## 核心技能
1. duckdb-query - 数据查询
2. charts - 图表生成
3. pdf-tools - 报告生成

## 工作流程
1. 使用 biz-knowledge 查找相关知识
2. 生成并验证 SQL
3. 执行查询并呈现结果
4. 给出业务解读和建议

## 限制
- 禁止直接操作数据库文件
- 所有查询必须通过 duckdb-query skill
```

### 2. Workspace 特定配置 (`workspaces/<name>/AGENTS.md`)

为特定用户或群组定制配置，可以：
- **补充**通用配置（添加额外技能）
- **覆盖**通用配置（修改工作流程）
- **添加**特定规则（群组规范）

#### 示例：VIP 用户

```markdown
# 用户特定配置

## 额外技能
- advanced-analytics - 高级分析工具

## 特殊权限
- 可以访问历史数据归档
- 可以导出原始数据

## 偏好设置
- 优先使用中文回复
- 图表使用深色主题
```

#### 示例：群组配置

```markdown
# 群组特定配置

## 群组规则
- 禁止在工作时间发送非紧急查询
- 所有查询必须与业务相关

## 通知设置
- 重要报告发送到群邮件列表
- 每日摘要在 9:00 AM 发送
```

---

## 最佳实践

### ✅ 推荐

1. **始终创建 `workspaces/AGENTS.md`**
   ```bash
   mercury init  # 会自动复制模板
   ```

2. **在通用配置中定义核心能力**
   - 品牌定位
   - 核心技能
   - 基本工作流程
   - 安全限制

3. **按需创建 Workspace 特定配置**
   - VIP 用户特殊权限
   - 群组特定规则
   - 个人偏好设置

### ❌ 避免

1. **不要在每个 Workspace 重复通用配置**
   ```
   ❌ workspaces/user1/AGENTS.md (完整复制通用配置)
   ✅ workspaces/user1/AGENTS.md (仅包含差异配置)
   ```

2. **不要在通用配置中硬编码用户特定信息**
   ```
   ❌ "为张三提供数据分析服务"
   ✅ "为用户提供数据分析服务"
   ```

---

## 技术实现

### pi 的搜索机制

```javascript
// pi-coding-agent/dist/core/resource-loader.js
function loadProjectContextFiles(options = {}) {
    const resolvedCwd = options.cwd ?? process.cwd();
    const contextFiles = [];
    
    // 从 cwd 向上遍历
    let currentDir = resolvedCwd;
    while (true) {
        const contextFile = loadContextFileFromDir(currentDir);
        if (contextFile) {
            contextFiles.unshift(contextFile);  // 父目录在前
        }
        if (currentDir === root) break;
        currentDir = resolve(currentDir, "..");
    }
    
    return contextFiles;
}
```

### Mercury 的实现

```typescript
// src/cli/commands/init.ts
export function initAction(): void {
  // 复制模板到 workspaces/AGENTS.md
  copyFileSync(
    join(TEMPLATES_DIR, "AGENTS.md"),
    join(wsRoot, "AGENTS.md")
  );
}

// src/core/runtime/workspace.ts
export function ensurePiResourceDir(dir: string): void {
  const agentsPath = path.join(dir, "AGENTS.md");
  
  // 创建空文件，允许继承父目录配置
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, "", "utf8");
  }
}
```

---

## 示例项目

### 企业微信数据分析 Agent

```
dongjin-mercury/
├── workspaces/
│   ├── AGENTS.md
│   │   └── 东锦小智通用配置
│   │
│   ├── ws-wecom-sales-team/
│   │   ├── AGENTS.md
│   │   │   └── 销售团队特定配置
│   │   └── ...
│   │
│   ├── ws-wecom-marketing/
│   │   ├── AGENTS.md
│   │   │   └── 市场部特定配置
│   │   └── ...
│   │
│   └── ws-wecom-executives/
│       ├── AGENTS.md
│       │   └── 高管特殊权限
│       └── ...
```

### 多品牌支持

```
multi-brand-mercury/
├── workspaces/
│   ├── AGENTS.md
│   │   └── 通用框架配置
│   │
│   ├── brand-a-users/
│   │   ├── AGENTS.md
│   │   │   └── 品牌 A 特定配置
│   │   └── ...
│   │
│   └── brand-b-users/
│       ├── AGENTS.md
│       │   └── 品牌 B 特定配置
│       └── ...
```

---

## 相关文档

- [Workspace 管理](workspaces.md)
- [Extension 系统](extensions.md)
- [权限控制](permissions.md)
- [Skills 开发](skills.md)

---

## 总结

| 配置文件 | 用途 | 必需性 |
|---------|------|--------|
| `workspaces/AGENTS.md` | Agent 通用配置 | ✅ 推荐创建 |
| `workspaces/<name>/AGENTS.md` | Workspace 特定配置 | ⚠️ 按需创建 |
| `~/.pi/agent/AGENTS.md` | 全局配置 | ❌ 可选 |

通过分层配置，你可以：
- ✅ 集中管理 Agent 核心能力
- ✅ 支持用户/群组个性化
- ✅ 保持配置的可维护性
- ✅ 轻松扩展多品牌支持
