数据：decision_summary(1)（C:\Users\cn-c-irisli\Desktop\数据\0_decision_data），这个数据是错误的决策数据。
要做的事情是：用这个错误的决策数据训练一遍qwen-decision-opsd模型，然后结果再和data/opsd的混合起来再训。

data/opsd的数据格式是：

<img width="652" height="355" alt="{0B77AFA8-4A03-4E51-A845-E5C5CB4C56CF}" src="https://github.com/user-attachments/assets/37262999-1862-4db1-b8eb-6092a5e407e3" />

# qwen-decision-opsd的输入输出格式：
这个模型不生成文本，是用分类头对候选agent打分。
输入有三部分：
  - **state**：用户问题，例如“番茄能量兑换入口”；
  - **questions.route.type**：固定为“choice”；
  - **question.route.criteria**：候选agent到职责描述的字典，共5个：NABIT、dfs、mia-mai、mcd-dictionary、standard-qa；
  - **question.route.instructions**：路由prompt，也就是“你是麦当劳智能助手的agent路由器...”

输出是每个问题一个结果：
{"route": 
  {"label": "standard-qa", "confidence": 0.875, "probabilities": {"NABIT": 0.025, "dfs": 0.025, ..., "standard-qa": 0.9} } }。

训练数据里的gold字段是这种结构。这个却agent的概率是0.9，其余4个各0.025，由build_dataset.py 的label-prob 参数生成。

# 对error_decision_data数据的处理
这个数据的格式：见decision-summary-20260317
<img width="778" height="233" alt="{1AE84AA4-00CA-4CFC-BC93-FC9DBECD9940}" src="https://github.com/user-attachments/assets/25cf551b-6608-49f5-89b2-6693a4e76a72" />



这个数据是 CSV，列是question，router_agent_order,called_agents,actual_used_agent等。
没有state、criteria、gold这几项，也没有路由prompt和各agent的描述。

1. 读取
  读取 data/error_decision_data/ 下的 243 个 CSV，合并后共 43557 行。
  
2. 清洗
  - 去掉 question 或 actual_used_agent 为空的行，并去除问题文本两端的空格。
  - 丢弃 2159 行：actual_used_agent 里有多个 agent（例如 1:NABIT,4:mai-mai），分不清哪个是正确答案。
  - 丢弃 239 行：答案是 food-safety。我手上没有这个 agent 的描述，路由 prompt 里也没有它。
  - 按（问题，答案）去重，最后剩 31810 条。

3. 确定标准答案
  - 取 actual_used_agent 里冒号后面的 agent 名，例如 2:mcd-dictionary 取 mcd-dictionary。
  - 这是我的判断：所有行的 actual_call_round 都不小于 2，路由器第一次选的都不对，后来真正回答问题的 agent
  就当作正确答案。带教没有明说，所以这是整个流程里最需要确认的假设。
  - 答案分布：mai-mai 15759、NABIT 10080、mcd-dictionary 3696、standard-qa 2275。dfs 一条都没有。
  
4. 转成模型的输入格式
  每条数据变成：
  - state 是用户问题。
  - questions.route 是一道选择题，路由 prompt 和 5 个 agent 的描述都用 qwen-decisions-opsd 训练时的那份。
  
5. 构建训练集
  - 用 build_dataset.py 把正确答案转成概率：正确 agent 0.9，其余 4 个各 0.025（和 opsd 原数据一致）。
  - 按 9:1 随机切分，训练集 28629 条，测试集 3181 条，放在 data/error_opsd/。
  
6. 训练设置
  - 起点是 qwen-decisions-opsd，在它已有的 LoRA 上继续训练。我改了 decision_train.py，让它支持已有 adapter 的模型，不再新建
  LoRA。
  - 2 个 epoch，学习率 5e-5，比默认的 2e-4 低，避免冲掉原来学到的东西。
  
需要你注意的风险：
  - dfs 在训练数据里一条都没有，但仍在候选里，模型可能会变得不愿选 dfs。训练完我会用 data/opsd/test.jsonl 验证这一点。
  - 丢掉的那部分数据（多 agent 和 food-safety）如果也很重要，我可以再想办法处理。





# 为啥要用错误数据train这个decision model？
补强模型的弱点
这批数据都是线上路由器第一次选错的问题，也是比较难的问题。把这些问题连同后来证明正确的agent一起训练，模型就能学会这类问题该选哪个agent。——**就是再已有模型上补错题的常规做法**。


- 从错误数据里取出“最终真正回答问题的agent”作为正确答案；
- 然后将数据整理成 qwen-decision-opsd 能读的格式，在这个模型的基础上继续训练。
- 训练里并没有“错误的选择”。模型每条只看到问题喝正确答案，路由器当时选错的那个agent（router_agent_order里排第一的）没有进入训练。所以模型学到的是“这个问题该选哪个agent”，不是“错在哪里、怎么纠正”。
- 如果想让模型明确避开错误选项，需要用别的训练方式，如：偏好训练，现在的流程不支持。
- 















