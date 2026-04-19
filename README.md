# BigData Radar

An AI-powered daily digest that tracks the latest notable features from major big data components — automatically fetching GitHub releases and merged feature PRs, summarizing them in Chinese, and pushing to your Feishu doc.

**Philosophy:** Stay on top of big data ecosystem changes without manually scanning GitHub every day.

## What You Get

A daily digest (pushed to Feishu) covering feature updates from:

- New **GitHub Releases** published on the current Beijing date
- Merged **feature / enhancement PRs** from the same day
- Summaries written for senior big data ops engineers — focusing on operational impact, config changes, and compatibility

## Components Tracked

| Component | Description | GitHub Repo |
|-----------|-------------|-------------|
| **HDFS** | Hadoop Distributed File System | [apache/hadoop](https://github.com/apache/hadoop) |
| **YARN** | Resource Negotiator | [apache/hadoop](https://github.com/apache/hadoop) |
| **Hive** | SQL on Hadoop | [apache/hive](https://github.com/apache/hive) |
| **Spark** | Unified Analytics Engine | [apache/spark](https://github.com/apache/spark) |
| **Flink** | Stream & Batch Processing | [apache/flink](https://github.com/apache/flink) |
| **StarRocks** | MPP OLAP Database | [StarRocks/starrocks](https://github.com/StarRocks/starrocks) |
| **Trino** | Distributed SQL Query Engine | [trinodb/trino](https://github.com/trinodb/trino) |

## Quick Start

### Installation (Claude Code)

```bash
git clone https://github.com/andy2025up-cloud/bigdata-radar.git ~/.claude/skills/bigdata-radar
```

No `npm install` needed — the fetch script uses only Node.js built-ins.

### First Run

Open Claude Code and say **"run bigdata-radar"** or ask about big data component updates.

The agent will:
1. Fetch today's GitHub releases and feature PRs for all 7 components
2. Generate a Chinese summary focused on operational impact
3. Push the digest to your configured Feishu doc (or display in-chat)

### Automated Daily Push

Set up a cron job to push automatically at 10:00 AM Beijing time:

```bash
# Create the push script
mkdir -p ~/.follow-bigdata
cat > ~/.follow-bigdata/daily-push.sh << 'EOF'
#!/bin/bash
SKILL_DIR="$HOME/.claude/skills/bigdata-radar"
DOC_TOKEN="<your-feishu-doc-token>"
CLAUDE_BIN="$(which claude)"
LARK_BIN="$(which lark-cli)"
LOG_FILE="$HOME/.follow-bigdata/cron.log"

RAW_JSON=$(cd "$SKILL_DIR/scripts" && node prepare-digest.js 2>/dev/null)
[ -z "$RAW_JSON" ] && exit 1

"$CLAUDE_BIN" --print --allowedTools "Bash" -p "
Generate a Chinese bigdata feature digest from this JSON and push to Feishu doc $DOC_TOKEN using $LARK_BIN:
$RAW_JSON
" >> "$LOG_FILE" 2>&1
EOF
chmod +x ~/.follow-bigdata/daily-push.sh

# Add cron (UTC 02:00 = Beijing 10:00)
(crontab -l 2>/dev/null; echo "0 2 * * * $HOME/.follow-bigdata/daily-push.sh") | crontab -
```

## How It Works

```
GitHub API (no auth required)
        │
        ├── /repos/{owner}/{repo}/releases     → today's new releases
        └── /repos/{owner}/{repo}/pulls        → today's merged feature PRs
                        │
                        ▼
              prepare-digest.js
           (outputs structured JSON)
                        │
                        ▼
              Claude (LLM remixing)
           (generates Chinese summary)
                        │
                        ▼
              lark-cli docs +update
           (appends to Feishu doc, keeps 7 days)
```

**Rate limits:** The script makes ~12 GitHub API requests per run. Anonymous rate limit is 60/hour — well within budget. Set `GITHUB_TOKEN` env var to increase to 5000/hour if needed.

## Customizing the Summary

Edit `prompts/summarize-feature.md` to change how features are described. It's plain English — no code needed. Changes take effect on the next run.

Current prompt focuses on:
- Operational impact (config changes, API changes, breaking changes)
- Performance and stability improvements
- Compatibility and upgrade considerations

## Configuration

Create `~/.follow-bigdata/config.json` with your own settings:

```json
{
  "language": "zh",
  "feishu": {
    "docToken": "<your-feishu-doc-token>",
    "wikiUrl": "<your-feishu-wiki-url>",
    "retentionDays": 7
  }
}
```

> **Note:** `SKILL.md` uses `<docToken>` as a placeholder — the actual token is read from this config file at runtime and is never hardcoded in any tracked file. Do not commit your real token to version control.

**How to get your Feishu doc token:**
1. Open your Feishu wiki/doc in the browser
2. For wiki URLs (`/wiki/TOKEN`): run `lark-cli wiki spaces get_node --params '{"token":"TOKEN"}'` and use the returned `obj_token`
3. For doc URLs (`/docx/TOKEN`): use the token directly from the URL

To increase GitHub API rate limits from 60/hour to 5000/hour:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

## File Structure

```
bigdata-radar/
├── SKILL.md                    # Claude skill definition
├── README.md
├── config/
│   └── sources.json            # Component repos & feature keyword filters
├── prompts/
│   └── summarize-feature.md    # Summary generation instructions (editable)
└── scripts/
    ├── package.json
    └── prepare-digest.js       # GitHub API fetcher — outputs JSON for Claude
```

## Requirements

- Node.js 18+
- Claude Code (or any agent that can read SKILL.md)
- `lark-cli` for Feishu delivery (optional)
- GitHub API access (anonymous, no token required for basic use)

## License

MIT
