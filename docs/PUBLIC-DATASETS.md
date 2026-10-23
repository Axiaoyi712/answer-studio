# GitHub 公开数据接入与验证

本次已下载并适配四个来源、数据许可明确的数据集，固定到具体 Git 提交，并逐文件校验 SHA256。它们用于通用能力测试与改进；没有把其他商家的客服承诺写入正式商品知识，也没有微调 DeepSeek 权重。

来源与全部校验值见 [datasets/catalog.json](../datasets/catalog.json)。原始文件、许可说明和适配结果在 `work/public-datasets/`，与正式数据库及知识包导出分开。

## 已接入数据

| 原始发布者与数据 | 本地有效数据 | 本项目用途 | 数据许可与边界 |
| --- | --- | --- | --- |
| [CrossWOZ / THU-coai](https://github.com/thu-coai/CrossWOZ)，使用同团队 [ConvLab-2 修订分发](https://github.com/thu-coai/ConvLab-2#supported-datasets) | val/test 保留 990 段对话、16,744 轮消息 | 中文社交接待、多轮与混合诉求测试材料 | 分发方逐项标明数据为 **CC BY 4.0**；不能用工具代码的 Apache 许可代替数据许可。旅游价格和服务规则不作本站知识。 |
| [DRCD / 台达研究院](https://github.com/DRCKnowledgeTeam/DRCD) | 1,000 段原文、3,524 道阅读题 | 依据检索与阅读回答探针 | 原仓库版权声明为 **CC BY-SA 3.0**，内容改编自维基百科；繁体通用阅读数据，不是商品资料。 |
| [Bitext Customer Support](https://github.com/bitext/customer-support-llm-chatbot-training-dataset) | 清洗后 23,861 条问题、27 类意图 | 口语、否定、拼写变化、客服意图覆盖 | 固定版本 [LICENSE.txt](https://github.com/bitext/customer-support-llm-chatbot-training-dataset/blob/72ea2203180d14a416b579c657033ecd21e59a11/LICENSE.txt)为 **CDLA Sharing 1.0**；合成英文。本次未使用 response 中的承诺和业务操作话术。 |
| [BANKING77 / PolyAI](https://github.com/PolyAI-LDN/task-specific-datasets#banking) | 清洗后 13,015 条问题、77 类意图 | 相近意图与换种说法的检索压力测试 | [CC BY 4.0](https://github.com/PolyAI-LDN/task-specific-datasets/blob/57ec275d8078af65b7731c2a98be812d844a6d6b/LICENSE)；英文银行域不能代表中文商品客服。 |

“有效”仅表示通过本次格式、去重、已知联系信息模式及标注一致性检查，不代表逐条人工审查或内容永远正确。对话、意图、阅读题是不同任务，不能把它们合称数万条商品问答。

适配 JSON 顶部保留作者、许可、固定提交、许可链接和修改说明。对外分发数据或修改后的数据文件时，须保留相应署名与许可，按各自原始条款处理，不统一标成项目代码许可。

## 已完成的改进

- 固定版本下载，缓存也核对长度与 SHA256；损坏文件不能静默通过。
- 规范化问法去重、隔离冲突标签、过滤命中邮箱/手机号/密钥模式的文本。CrossWOZ 命中时排除整段，防止从历史重新带入。
- 保留上游拆分；Bitext 没有官方拆分，按问题哈希自建 70/20/10。规范化相同问题不会跨集合；模板近似句仍可能跨集合。
- 独立报告同意图示例召回、中文原文召回、本地社交接待和真实模型小样本结果，保留逐题结果及源码指纹。
- 根据开发集补充本地致谢、告别和收尾接待。例如“好的，非常感谢，没有问题了”可直接接话；“谢谢，P01单支多少钱？”仍走检索和事实检查，不会被吞掉。
- 不自动审核、发布公开资料，不执行数据中的指令，不采纳公开退款、价格或账号操作承诺。

## 本轮测量

后续 0.13.2 已修复下文复杂致谢失败，并复测同一批样本为 15/16；该复测属于已知回归，不是新的独立盲测。另以合成商家资料验证规则咨询、实际办理及事实核对。详见 [自然收尾与售后咨询分流](releases/RECEPTION-0.13.2.md)。以下保留 0.13.1 原始结果。

完整报告：[公开数据及真实模型检查](../work/public-datasets/reports/1792589780283-test-model/report.md)，逐题结果在同目录 `report.json`。

| 子任务 | 结果 | 正确解读 |
| --- | --- | --- |
| CrossWOZ 开发集纯社交本地覆盖 | 修改前 24/229 → 修改后 108/229 | 同一开发集的覆盖提升，不能当独立泛化准确率。 |
| CrossWOZ 未用于修改的纯社交问法 | 58/151 | 只测无需模型的覆盖；其余仍进入正常模型流程，不等于必然转人工。与 val 重复的规范化问法未重复计入。 |
| DRCD 120 题、1,000 段原文 | Recall@1 90.0%；Recall@5 97.5% | 前五条是否包含标注原文，不是生成正确率。索引没有放入测试问题或答案标签。 |
| Bitext 自建 test 中 81 题、216 条参考 | 同意图 Recall@5 84.0% | 模板近似句可能使结果偏乐观，不当成真实客服效果。 |
| BANKING77 上游 test 中 231 题、616 条 train 参考 | 同意图 Recall@5 51.1% | 现有字符检索对英文细分意图能力有限，不能宣传已具备稳定语义分类。 |
| 真实 DeepSeek 的 16 个小样本场景 | 14/16；实际请求 12 次，输入 10,851、输出 430 Token | 4 个社交场景由本地完成；阅读只检查单份已给依据下的严格答案片段和引用。不是整体解决率或 87.5%“置信度”。 |
| 项目自动测试 | 165/165 | 包含适配、完整性、拆分隔离、混合诉求及原有功能。 |

真实模型检查保留两个失败：一条百科历史问题被商品客服转人工；一条复杂致谢被模型错误标为没有引用的事实回答。后者表明复杂收尾仍有改进空间。没有删除失败，或为提高分数将旅游、百科资料加入商品客服。

事实检查仍是确定性规则与来源约束，不是通用语义蕴含证明。数据规模、公开测试分数和模型自报把握不能代替真实业务的正确解决率。

## 如何运行

在项目目录使用 Node.js 24 和 `tar`。本次使用 Windows 自带 tar 读取 ZIP 中指定的 JSON，不把任意归档路径解压到磁盘；无需安装训练框架或 Python。

```powershell
# 首次下载，本次已完成。以后复用并校验缓存。
npm.cmd run datasets:prepare

# 全部使用缓存，不联网。
node scripts/fetch-public-datasets.mjs --offline

# 默认 test，无模型调用或 API 费用。
npm.cmd run datasets:check

# 开发集检查；BANKING77 无 dev，本项仍报告 test，不据此调参。
npm.cmd run datasets:check -- --split dev

# 可选，调用已配置模型，默认最多16个场景，允许1–40。
node --env-file-if-exists=.env scripts/check-public-datasets.mjs --model --limit 16
```

意图探针每类固定哈希选 8 条参考、3 条查询，不是全量模型评测。每次报告单独写入 `work/public-datasets/reports/时间戳-拆分/`，不覆盖历史结果。

适配 JSON 在 `work/public-datasets/prepared/`。检查脚本重新校验原始缓存，手改适配 JSON 不会改变正式测试。自己的脱敏咨询题仍通过工作台“版本与部署”的回归题导入，关联真实商品依据；不要把公开 JSON 当商品知识包导入。

知识完整度可按 [客服知识补全清单](../datasets/客服知识补全清单.md)检查。适用的主题再到“对话建库”确认真实政策、审核发布，公开数据不能替你确认运费、价格或售后条件。

后续流程：原始来源 → 数据许可 → 固定版本和校验值 → 脱敏去重 → 任务适配 → 测试 → 审查实际改动。用于调规则的 test 题成为已知开发题后，不能再声称是新的独立测试。

## 其他筛选结果

查阅了 [CSDS 官方仓库](https://github.com/xiaolinAndy/CSDS)、[CMRC2018](https://github.com/ymcui/cmrc2018)、[CLINC150](https://github.com/clinc/oos-eval)。CSDS 客服摘要很相关，但本次尚未确认下载数据适用于本项目的许可；CMRC2018 README 链接的 LICENSE 当前返回 404，未擅自继承其他镜像许可，因此没有导入。CLINC150 保留为领域外识别候选，当前没有相应分类器，暂不重复接入。
