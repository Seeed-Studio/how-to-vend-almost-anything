# 站点说明

本站当前的任务是**第一版开放设计征集**：每个 Fab Lab 一台售货机，默认售卖 XIAO，由实验室选择本地产品，并公开可复用的机器改进。项目由 Seeed Studio 支持，推进顺序是**共同设计 → 发布第一版 → 开放实验室申请**。供货安排、申请资格与支持细节将在之后公布。

零号版本是由 Wio Terminal 控制的可运行参考原型。源文件、照片和运行录像，为设计征集提供真实的起点。路线图中的状态记录参考原型与后续工作的进展，不代表第一版已经发布。

## 已发布页面

GitHub Pages 发布 `/docs`。入口页介绍项目并提供英文、中文入口。两种语言具有对应的页面，页眉中的语言链接切换到另一种语言的同一页。

| 页面 | 文件 | 用途 |
| --- | --- | --- |
| 愿景 | `index.html` | 开放征集、共同理念、设计方向、原型、发布路线与常见问题 |
| 共建工作台 | `journey.html` | 参考路线图、系统筛选、部件、标准草案与贡献任务 |
| 实验室网络 | `network.html` | 参与意向、未来网络、目录地图与已审核记录 |
| 参考机器 | `exploded.html` | 零号版本交互模型与替换件说明 |
| 开源声明 | `open-source.html` | 库许可、地图署名与上游来源 |

各页保持一致的标识、导航顺序、语言切换和参与入口。页眉加号是项目符号，并非 Seeed Studio 标志。

## 设计与交互文件

设计方向是一份简洁的工作坊刊物：温暖纸色、Seeed 深青色 `#003A4A`、绿色 `#8FC31F`、细分隔线、真实原型图片和紧凑的贡献卡片。设计笔记保存在本地 `_archived/plans/`，不属于已发布的站点。

- `assets/css/site.css`：共用字体、颜色、页眉、页脚、响应式导航与配套页面样式。
- `assets/css/initiative.css`：首页的版式和贡献组件。
- `assets/js/initiative.js`：导航展开、首页章节导航、录像切换与分享。
- `assets/css/pages.css`：数据驱动的工作台和网络页面布局。
- `exploded.css` 与 `exploded.js`：参考机器查看器。
- `assets/css/section-nav.css` 与 `assets/js/section-nav.js`：查看器的章节导航。

首页照片使用 `assets/reference-machine.jpg`。原型播放器使用已有的 `real-operation-order-dispense` 和 `real-operation-balance-dispense` 封面及录像。未制造的概念不能展示为真实机器。录像使用原生控件，不自动播放，并尊重减少动态效果的设置。

## 本地预览与检查

在仓库根目录运行：

```bash
python3 -m http.server 8000 --directory docs
```

打开 `http://localhost:8000/`，再进入英文或中文页面。通过 HTTP 预览，路线图与地图的 JSON 才能正常加载。

检查已有数据规则：

```bash
node scripts/validate-site-data.mjs
```

检查两种语言的桌面与手机布局，以及导航展开、贡献链接、原型录像、分享结果、工作台筛选、地图空状态、键盘焦点与页面锚点。

## 内容与提交

首页文案位于各语言的 `index.html`。工作台和网络页面读取各自的 `data/` 文件。`done`、`in_progress`、`needs_contributors` 和 `planned` 状态需要与证据相符。标准提案在审核前保持为想法或草稿。

贡献与实验室意向通过已有的 GitHub issue 表单提交，需要 GitHub 账号。意向登记不等于申请或名额分配。实验室、机器、产品和可获得性记录须经过审核后公开，不编造安装、库存、价格或支持条款。

`replacements.js` 用于追加带版本的机器改进。保留 `parts-manifest.js`、源 CAD 和 `data/models.json` 中的零号版本基线。替代件不自动等于新修订版本。

配置认证后，`directory-labs.json` 才会从 FabLabs.io 刷新。名录成员与项目参与须分开理解。记录在提交审核前保持为空。详见[名录更新指南](FABLABS_DIRECTORY.md)。

## 发布与署名

保留现有 GitHub Pages 配置与相对路径，兼容 `/how-to-vend-almost-anything/` 项目子路径。不要把访问令牌放进站点；名录认证信息应保存在 Actions secret 中。

- 机器照片、录像和 CAD 来自本仓库。
- Seeed Studio 名称与颜色遵循[品牌规范](https://www.seeedstudio.com/blog/branding-kit/)。
- 查看器使用 Three.js 和 occt-import-js，地图使用 Leaflet 与 OpenStreetMap 瓦片。保留上游声明与 © OpenStreetMap 贡献者。
- FabLabs.io 署名保留在目录快照中。本项目并非 Fab Foundation 官方项目。
- 更多信息见[开源声明](open-source.html)和[许可清单](THIRD_PARTY_NOTICES.md)。

本次网站更新不修改硬件、固件、装配指南、issue 模板、数据结构或部署配置。
