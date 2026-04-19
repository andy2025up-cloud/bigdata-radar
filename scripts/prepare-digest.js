#!/usr/bin/env node

// ============================================================================
// BigData Radar — Prepare Digest
// ============================================================================
// 获取各大数据组件当天（北京时间）的最新 feature/release 信息
// 数据来源：GitHub Releases + Merged PRs
// 输出：单个 JSON blob，供 LLM 生成中文摘要
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..');
const USER_DIR = join(homedir(), '.follow-bigdata');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const SOURCES_PATH = join(SKILL_DIR, 'config', 'sources.json');

// GitHub API headers
function getHeaders() {
  const headers = { 'User-Agent': 'bigdata-radar/1.0', 'Accept': 'application/vnd.github.v3+json' };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `token ${token}`;
  return headers;
}

// 北京时间当天的起始时间（UTC）
function getBeijingDayStart() {
  const now = new Date();
  // Beijing = UTC+8
  const beijingNow = new Date(now.getTime() + 8 * 3600 * 1000);
  const beijingDayStart = new Date(Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    0, 0, 0
  ) - 8 * 3600 * 1000);
  return beijingDayStart;
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { headers: getHeaders() });
    if (res.status === 403) return { error: 'rate_limited' };
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// 判断 PR 标题是否属于 feature 类型
function isFeaturePR(pr, patterns) {
  const title = pr.title || '';
  const labels = (pr.labels || []).map(l => l.name.toLowerCase());

  // 检查 label
  const featureLabels = ['feature', 'enhancement', 'improvement', 'new feature',
    'feature request', 'type: feature', 'kind/feature', 'type:feature'];
  if (labels.some(l => featureLabels.includes(l))) return true;

  // 检查标题关键词
  const titleLower = title.toLowerCase();
  const titlePatterns = [
    /^\[spark-\d+\]/i, /^\[flink-\d+\]/i, /^\[hive-\d+\]/i,
    /^\[hdfs-\d+\]/i, /^\[yarn-\d+\]/i, /^\[trino-\d+\]/i,
    /^feat[:(]/, /^\[feature\]/i, /^\[enhancement\]/i, /^\[improvement\]/i,
    /^add\s+/i, /^support\s+/i, /^implement\s+/i, /^introduce\s+/i,
    /^enable\s+/i, /^\[new\]/i,
  ];
  return titlePatterns.some(p => p.test(title));
}

// 过滤 Hadoop 仓库中属于特定组件的 PR
function filterByComponent(prs, component) {
  if (!component.keywords || component.keywords.length === 0) return prs;
  const keywords = component.keywords;
  return prs.filter(pr => {
    const text = (pr.title + ' ' + (pr.body || '')).toLowerCase();
    return keywords.some(k => text.includes(k.toLowerCase()));
  });
}

// 获取单个组件的数据（releases + merged PRs）
async function fetchComponent(component, dayStart) {
  const { owner, repo, name } = component;
  const since = dayStart.toISOString();
  const result = { name, description: component.description, releases: [], prs: [] };

  // 1. 获取 Releases（检查今天发布的）
  const releases = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`);
  if (releases && !releases.error && Array.isArray(releases)) {
    result.releases = releases
      .filter(r => r.published_at && new Date(r.published_at) >= dayStart)
      .map(r => ({
        version: r.tag_name,
        name: r.name,
        url: r.html_url,
        publishedAt: r.published_at,
        body: (r.body || '').slice(0, 2000) // 截取前2000字符
      }));
  }

  // 2. 获取今天合并的 PR（feature 类型）
  const prs = await fetchJSON(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`
  );
  if (prs && !prs.error && Array.isArray(prs)) {
    let filtered = prs
      .filter(pr => pr.merged_at && new Date(pr.merged_at) >= dayStart)
      .filter(pr => isFeaturePR(pr, []));

    // Hadoop 仓库需要按关键词过滤属于本组件的 PR
    if (repo === 'hadoop') {
      filtered = filterByComponent(filtered, component);
    }

    result.prs = filtered.map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      mergedAt: pr.merged_at,
      labels: (pr.labels || []).map(l => l.name),
      body: (pr.body || '').slice(0, 500)
    }));
  }

  return result;
}

async function main() {
  const errors = [];
  const dayStart = getBeijingDayStart();

  // 读取配置
  let config = { language: 'zh', feishu: {} };
  if (existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')); }
    catch (e) { errors.push(`Config error: ${e.message}`); }
  }

  // 读取数据源
  const sources = JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));

  // 读取 Prompts
  const promptPath = join(SKILL_DIR, 'prompts', 'summarize-feature.md');
  let prompt = '';
  if (existsSync(promptPath)) {
    prompt = await readFile(promptPath, 'utf-8');
  }

  // 并发获取所有组件（注意 Hadoop 只请求一次，避免重复）
  const components = sources.components;
  const results = await Promise.all(components.map(c => fetchComponent(c, dayStart)));

  // 过滤掉没有任何更新的组件
  const withUpdates = results.filter(r => r.releases.length > 0 || r.prs.length > 0);

  // 统计
  const stats = {
    date: dayStart.toISOString(),
    beijingDate: new Date(dayStart.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10),
    totalComponents: components.length,
    componentsWithUpdates: withUpdates.length,
    totalReleases: results.reduce((s, r) => s + r.releases.length, 0),
    totalPRs: results.reduce((s, r) => s + r.prs.length, 0),
  };

  console.log(JSON.stringify({
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config,
    stats,
    components: results,
    prompt,
    errors: errors.length > 0 ? errors : undefined
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
