# FabLabs.io 名录与 FAB 行动

已于 **2026-10-22** 核实：[公开接口 `GET https://www.fablabs.io/api/labs`](https://www.fablabs.io/api/labs) 无需账户、OAuth 或 token，返回完整 JSON 数组。本次包含 2,882 条名录、146 个国家/地区代码。它返回全部已批准的名录，没有分页或服务端筛选；已批准不代表目前营业或参与售货项目。

旧版多资源 API 已在 [2026 年 1 月的官方变更](https://github.com/fablabbcn/fablabs.io/commit/9832b4ac13a08732ee35a60bf1d67ab17cd4bf00)中移除。旧 Swagger 不能用于证明项目、设备或写入接口仍有效。`https://api.fablabs.io/0/labs` 仍有兼容路由；优先使用公开 `/api/labs`。

## 刷新方法

从仓库根目录运行：

```bash
node --test scripts/fetch-fablabs-directory.test.mjs scripts/network.test.mjs
node scripts/fetch-fablabs-directory.mjs
node scripts/validate-site-data.mjs
```

[刷新工作流](../../.github/workflows/fablabs-directory.yml)每天 03:15 UTC（北京时间 11:15）运行，也支持手动启动。定时任务从 `main` 启动，然后检出并提交 `site/fab-vending-pages`，因为 GitHub Pages 发布的是这个分支。现在不需要 Actions secrets，工作流不再读取旧 `FABLABS_ACCESS_TOKEN` 和 `FABLABS_API_BASE`。

同步保留名称、城市、国家、坐标、能力声明、活动状态和公开链接；不复制邮箱、电话和详细地址。导入记录始终是 `directory`，不是售货项目参与者。缺失坐标保留 `null`。柴火创客空间（`fablabs:1543`）是例外：公开接口没有坐标，同步使用 OpenStreetMap 上的万科云城（22.5767074, 113.9387176），与其 FabLabs.io 资料页上的街道地址一致。之后接口若提供坐标，则以接口为准。请求失败、空数据、格式异常或重复 ID 不会替换上一次有效数据。未改变的目录内容不会生成仅日期变化的提交。

网站从 [`data/directory-labs.json`](data/directory-labs.json)读取快照，浏览器不会直接调用 FabLabs.io。网址由供应链接中优先选取非社交网站的链接，并保留其他安全链接；接口没有标明主网站。活动状态和制造能力需要向实验室确认，不能据此推断设备预约、库存或机器在线状态。

## 可以推进的 FAB 行动

[网络页](network.html#explore)可以按名录、意向、试点、已核实机器和新动态筛选地图与实验室列表。草稿需要用户自行提交，公开项目记录仍需人工审核。

更详细的接口核实结果、统计、工作坊/共享制作/知识交流路线图和数据使用条件见[英文指南](../en/FABLABS_DIRECTORY.md)。[FabLabs.io 条款](https://www.fablabs.io/tos)第 7 节对批量数据使用、开放分析数据集和商业使用/招揽作出规定；商业活动或更广泛再分发前应与提供方确认。

名录不是 Fab Foundation 的背书。`labs.json`、`machines.json`、`products.json`、`updates.json`始终独立维护，经审核后才能发布项目参与、机器、产品和更新记录。
