# AI 协作接口 / AI collaboration interface

[中文首页](../README.md) · [English](../README.en.md)

This document describes the local JSON exchange and revision-safe write contract. The application does not include an AI backend. Only use the API from an authorized local agent. Preserve user decisions and verify every write by reading the state again.

## AI 分析导入导出

在机会库勾选岗位，可导出 AI 协作文件。默认包含岗位事实和个人判断，不含联系人、沟通、面试原文或附件；材料摘要由用户主动选择。

已有机会的分析草稿：

```json
{
  "kind": "jobcat-ai-draft",
  "schemaVersion": 1,
  "items": [{
    "jobId": "从协作文件原样复制",
    "baseRevision": 1,
    "jdVersionId": "从协作文件原样复制；没有 JD 时为 null",
    "recommendation": "值得尝试",
    "analysis": "有证据的分析、差距与待核实事项",
    "materialIds": []
  }]
}
```

新发现的机会可以改为 `title, company, city, salary, direction, jd, platform, url, reason, questions, analysis`，并提供 `requestId` 关联搜岗需求。只追加分析或新机会，不覆盖个人决定和申请阶段。导入前先预览；岗位版本已变化时阻止旧分析写入。

## 当前聊天直接回填契约

此项目的 AI 可以通过本机 `/api/state` 读取需求和写入结果，无需用户来回导出。网页并未自动接入 AI。

1. 读取 `GET /api/state`，保存顶层 `revision`。
2. 根据用户指定的需求 ID 或最新需求开展搜索，不读取无关私人材料。
3. 每个结果保存岗位事实、原链接、收集时间、核验时间、分析依据与不确定性。真实内容缺失时留空，不用推测凑齐。
4. 使用 `web/model.mjs` 的 `makeJob`／`applyDraft` 生成记录，关联 `searchRequests[].resultIds`。重复机会追加来源或分析，不覆盖用户记录。
5. 将实际搜索范围、限制、结果数量写到需求的 `report`，据实际情况更新 `status` 与 `updatedAt`。
6. 发送 `PUT /api/state`，JSON 为 `{ "revision": 原版本, "state": 完整更新后的工作区 }`。HTTP 409 时重新读取并合并，不能覆盖刚更新的数据。
7. 回读确认。若网页已打开，提示刷新查看；不要声称网页会自动实时更新。

