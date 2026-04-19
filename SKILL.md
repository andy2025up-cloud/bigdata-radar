---
name: bigdata-radar
description: 大数据组件 Feature 雷达 — 每日追踪 HDFS、Hive、YARN、Spark、Flink、StarRocks、Trino 的最新 feature，自动推送到飞书。Use when user asks about big data component updates, new features, or wants to run the daily bigdata digest.
---

# BigData Radar — 大数据组件 Feature 日报

追踪以下组件在北京时间当天的最新 feature、release 和重要 PR：
**HDFS · Hive · YARN · Spark · Flink · StarRocks · Trino**

数据来源：GitHub Releases + Merged PRs（feature/enhancement 类型）

## 配置

运行前先读取用户配置文件 `~/.follow-bigdata/config.json`，获取飞书文档 token：

```json
{
  "feishu": {
    "docToken": "<your-feishu-doc-token>"
  }
}
```

如未配置，Step 3/4 跳过飞书推送，仅在终端输出摘要。

## 运行摘要

### Step 1：获取数据

```bash
cd <skill-dir>/scripts && node prepare-digest.js 2>/dev/null
```

输出 JSON 包含：
- `stats` — 各组件更新统计
- `components[]` — 每个组件的 releases 和 prs
- `prompt` — 生成摘要的指令

### Step 2：生成摘要

读取 JSON 中的 `prompt` 字段，按其指令生成中文摘要。

**规则：**
- 只使用 JSON 中真实存在的数据，不编造 feature
- 有新 Release 时优先展示，版本号加粗
- PR 每条写清楚：做了什么、为什么重要、运维影响
- 没有更新的组件跳过
- 如果所有组件都没有当天更新，输出：`今日（北京时间）暂无组件 feature 更新，明日再见。`

### Step 3：清理飞书文档旧内容（保留 7 天）

从 `~/.follow-bigdata/config.json` 读取 `feishu.docToken`，然后：

```bash
lark-cli docs +fetch --doc <docToken>
```

识别 `# 大数据组件 Feature 日报 — YYYY年M月D日` 标题，删除 7 天前的条目：

```bash
lark-cli docs +update --doc <docToken> --mode delete_range --selection-by-title "# 大数据组件 Feature 日报 — <过期日期>"
```

### Step 4：推送到飞书

```bash
lark-cli docs +update --doc <docToken> --mode append --markdown "<摘要内容>"
```
