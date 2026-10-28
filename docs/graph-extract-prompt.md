# 图谱实体关系抽取 Prompt + 输出格式

> 来源代码：
> - `process_v2/processors/graph_processor.py`
> - `process_v2/configs/graph_config.py`
> - `models/schemas_graph.py`

抽取时发给 LLM 的消息为 `[system, user]` 两条。其中 system 由三部分拼接而成：

1. 默认/自定义抽取 system（`SYSTEM_EXTRACT`，可被 `custom_prompts.extract_system` 覆盖）
2. 核心规则（`CORE_EXTRACT_RULES`，强制追加，用户无法覆盖）
3. JSON 格式约束（`GraphLLMClient.chat_with_text` 自动追加）

调用：`llm.chat_with_text(messages, ExtractionResult)`，使用 `response_format={"type": "json_object"}` 做结构化输出。

---

## 1. System Prompt

### 1.1 默认抽取 system（`SYSTEM_EXTRACT`，可被 `custom_prompts.extract_system` 覆盖）

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
```

### 1.2 核心规则（`CORE_EXTRACT_RULES`，强制追加到 system 末尾，用户无法覆盖）

```
【核心输出规则 — 不可违反】
1. 每个实体必须包含 "id"、"name"、"type" 三个字段，缺一不可。name 必须是非空字符串。
2. 如果某个概念更适合作为其他实体的属性（如数值、状态、标签），请将其填入父实体的 properties 中，不要创建独立实体。
3. 关系的 source_id 和 target_id 必须引用本次输出中已定义的实体 id，不能引用不存在的 id。
4. 输出必须严格符合 JSON Schema 定义的结构，不要添加 schema 中未定义的字段。
5. 实体 id 使用简短递增格式: e1, e2, e3...，不要使用其他命名格式。
6. 只输出有充分文本证据支持的实体和关系，不要推测或虚构。
```

### 1.3 JSON 格式约束（LLM client 自动追加到 system 末尾）

```
[输出格式要求] 你必须且只能返回一个 JSON 对象，不要返回 Markdown、解释文字或其他格式。JSON 必须符合以下 schema:
{...ExtractionResult 的 JSON Schema...}
```

---

## 2. User Prompt

### 默认模板

`render_extract_user_prompt` 的 fallback，可被 `custom_prompts.extract_user_template` 覆盖，支持 `{ontology_desc}`、`{text}` 占位符。

```
本体定义:
{ontology_desc}

请从以下文本中抽取实体和关系:
{text}
```

### ontology_desc 拼接格式

由本体（Ontology）动态拼成：

```
实体类型:
  - <实体类型名>: <描述> [属性名(类型*), 属性名(类型), ...]
  ...

关系类型:
  - <关系类型名>: <描述> (<source_types>-><target_types>) [属性名(类型*), ...]
  ...
```

说明：
- 属性名后带 `*` 表示 `required=true`
- 属性 `data_type` 取值：`string` / `int` / `float` / `bool` / `datetime`

---

## 3. 输出格式（`ExtractionResult` Schema）

LLM 必须返回如下 JSON 对象：

```json
{
  "entities": [
    {
      "id": "e1",
      "name": "实体名称",
      "type": "对应本体中的 EntityType name",
      "properties": { "属性名": "属性值" }
    }
  ],
  "relations": [
    {
      "source_id": "e1",
      "target_id": "e2",
      "type": "对应本体中的 RelationType name",
      "properties": { "属性名": "属性值" }
    }
  ]
}
```

### Pydantic 模型定义

| 模型 | 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| `Entity` | `id` | str | 实体唯一标识（e1, e2, ...） |
| | `name` | str | 实体名称（非空） |
| | `type` | str | 对应 EntityType name |
| | `properties` | dict | 默认空 |
| `Relation` | `source_id` | str | 起点实体 id |
| | `target_id` | str | 终点实体 id |
| | `type` | str | 对应 RelationType name |
| | `properties` | dict | 默认空 |
| `ExtractionResult` | `entities` | List[Entity] | 默认空列表 |
| | `relations` | List[Relation] | 默认空列表 |

---

## 4. 调用链路小结

1. **消息组装**：`GraphProcessor.extract_chunk()` 生成 `[{role: system, ...}, {role: user, ...}]`
2. **system** = `resolve_prompt(custom.extract_system, SYSTEM_EXTRACT)` + `CORE_EXTRACT_RULES`，再由 LLM client 追加 JSON schema 约束
3. **user** = `render_extract_user_prompt(text, ontology_desc, custom_prompts)`
4. 调用 `llm.chat_with_text(messages, ExtractionResult)`，`response_format={"type": "json_object"}`
5. 返回 `(ExtractionResult, system_prompt, user_prompt, raw_response_text)`

---

## 附：自定义 Prompt 示例（`custom_prompts`）

```json
{
  "extract_system": "你是医疗信息抽取专家。严格按照本体定义抽取实体和关系，注意区分疾病和症状。请严格按照 JSON Schema 输出。",
  "extract_user_template": "本体定义:\n{ontology_desc}\n\n请从以下医疗文档中抽取实体和关系:\n{text}"
}
```
