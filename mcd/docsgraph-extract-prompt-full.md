# 图谱实体关系抽取 — 完整 Prompt（System + User + Output）

> 这是实际发给 LLM 时拼接后的完整形态。
> system 由「默认 system + 核心规则 + JSON schema 约束」三段拼成；user 由本体描述 + 待抽取文本拼成；output 为 LLM 返回的 JSON。
> 下方 `ontology_desc` 与 `text` 均为示例，运行时动态替换。

---

## SYSTEM PROMPT（完整拼接）

```
你是一位信息抽取专家。根据用户提供的本体定义和文档内容，从文档中抽取实体和关系。

要求：
1. 只抽取本体中定义的实体类型和关系类型，不要发明新类型
2. 实体必须填充本体中 required=true 的属性
3. 关系的 source/target 实体类型必须符合本体中的约束
4. 同一实体在文档中多次出现时，使用相同的 id
5. 实体 id 格式: e1, e2, e3...
6. 如果文档中没有足够信息确定某个实体或关系，不要强行抽取

请严格按照 JSON Schema 输出。

【核心输出规则 — 不可违反】
1. 每个实体必须包含 "id"、"name"、"type" 三个字段，缺一不可。name 必须是非空字符串。
2. 如果某个概念更适合作为其他实体的属性（如数值、状态、标签），请将其填入父实体的 properties 中，不要创建独立实体。
3. 关系的 source_id 和 target_id 必须引用本次输出中已定义的实体 id，不能引用不存在的 id。
4. 输出必须严格符合 JSON Schema 定义的结构，不要添加 schema 中未定义的字段。
5. 实体 id 使用简短递增格式: e1, e2, e3...，不要使用其他命名格式。
6. 只输出有充分文本证据支持的实体和关系，不要推测或虚构。

[输出格式要求] 你必须且只能返回一个 JSON 对象，不要返回 Markdown、解释文字或其他格式。JSON 必须符合以下 schema:
{"$defs":{"Entity":{"properties":{"id":{"description":"实体唯一标识","title":"Id","type":"string"},"name":{"description":"实体名称","title":"Name","type":"string"},"type":{"description":"对应 EntityType name","title":"Type","type":"string"},"properties":{"title":"Properties","type":"object"}},"required":["id","name","type"],"title":"Entity","type":"object"},"Relation":{"properties":{"source_id":{"description":"起点实体 id","title":"Source Id","type":"string"},"target_id":{"description":"终点实体 id","title":"Target Id","type":"string"},"type":{"description":"对应 RelationType name","title":"Type","type":"string"},"properties":{"title":"Properties","type":"object"}},"required":["source_id","target_id","type"],"title":"Relation","type":"object"}},"properties":{"entities":{"items":{"$ref":"#/$defs/Entity"},"title":"Entities","type":"array"},"relations":{"items":{"$ref":"#/$defs/Relation"},"title":"Relations","type":"array"}},"title":"ExtractionResult","type":"object"}
```

> 说明：
> - 第 1 段（默认 system）可被 `custom_prompts.extract_system` 整体替换。
> - 第 2 段（核心规则）强制追加，用户无法覆盖。
> - 第 3 段（JSON schema 约束）由 `GraphLLMClient.chat_with_text` 自动追加，schema 为 `ExtractionResult.model_json_schema()` 的实际内容。

---

## USER PROMPT（完整拼接）

默认模板为 `本体定义:\n{ontology_desc}\n\n请从以下文本中抽取实体和关系:\n{text}`，可被 `custom_prompts.extract_user_template` 覆盖。

以下用一个示例本体 + 示例文本填充：

```
本体定义:
实体类型:
  - Patient: 就诊患者，具有独立身份的自然人 [age(int), gender(string)]
  - Disease: 疾病诊断名称 [icd_code(string)]
  - Drug: 药品 [dosage(string), route(string)]

关系类型:
  - DIAGNOSED_WITH: 患者被诊断出某疾病 (['Patient']->['Disease']) []
  - PRESCRIBED: 针对疾病开具药品 (['Patient']->['Drug']) [dosage(string)]

请从以下文本中抽取实体和关系:
患者张三，男，65岁，因胸闷气短入院，诊断为冠心病，给予阿司匹林100mg口服。
```

> `ontology_desc` 的拼接规则：
> - 实体类型行：`  - <类型名>: <描述> [属性名(类型*), ...]`，`*` 表示 required
> - 关系类型行：`  - <关系名>: <描述> (<source_types>-><target_types>) [属性名(类型*), ...]`
> - 属性 data_type ∈ {string, int, float, bool, datetime}

---

## OUTPUT（LLM 返回的 JSON，符合 ExtractionResult schema）

```json
{
  "entities": [
    {
      "id": "e1",
      "name": "张三",
      "type": "Patient",
      "properties": { "age": 65, "gender": "男" }
    },
    {
      "id": "e2",
      "name": "冠心病",
      "type": "Disease",
      "properties": {}
    },
    {
      "id": "e3",
      "name": "阿司匹林",
      "type": "Drug",
      "properties": { "dosage": "100mg", "route": "口服" }
    }
  ],
  "relations": [
    {
      "source_id": "e1",
      "target_id": "e2",
      "type": "DIAGNOSED_WITH",
      "properties": {}
    },
    {
      "source_id": "e1",
      "target_id": "e3",
      "type": "PRESCRIBED",
      "properties": { "dosage": "100mg" }
    }
  ]
}
```

---

## 输出 Schema 字段说明

| 模型 | 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `Entity` | `id` | str | ✓ | 实体唯一标识（e1, e2, ...） |
| | `name` | str | ✓ | 实体名称（非空） |
| | `type` | str | ✓ | 对应 EntityType name |
| | `properties` | dict | | 默认空 |
| `Relation` | `source_id` | str | ✓ | 起点实体 id |
| | `target_id` | str | ✓ | 终点实体 id |
| | `type` | str | ✓ | 对应 RelationType name |
| | `properties` | dict | | 默认空 |
| `ExtractionResult` | `entities` | List[Entity] | | 默认空列表 |
| | `relations` | List[Relation] | | 默认空列表 |
