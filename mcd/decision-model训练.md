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
这个数据的格式：
report_id,router_agent_order,actual_call_round,called_agents,actual_used_agent,question,add_time,etl_date
677ebb0563c80f92c0e4a2a79f291ff5,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",2,"NABIT,mcd-dictionary",2:mcd-dictionary,应用袖珍手册,2026-03-17 19:02:41,2026-03-18
cec06d8f2f7e3cab18030257daea1a23,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,共享清洁评价,2026-03-17 18:12:40,2026-03-18
f73e1a3518b45f2748bea72be098d7c5,"{""1"": ""mcd-dictionary"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mai-mai""}",3,"mcd-dictionary,standard-qa,NABIT",3:NABIT,cip是什么意思,2026-03-17 18:02:57,2026-03-18
7e7ece0099bd6b6d9b703461cfc5a03f,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",4,"NABIT,mcd-dictionary,standard-qa,mai-mai",4:mai-mai,非食品处理,2026-03-17 16:27:57,2026-03-18
869d633ef24bad512d7f4a88a308727f,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,顾客问卷规则,2026-03-17 09:11:24,2026-03-18
6b7028e8159b5de0c44a648572ccdae7,"{""1"": ""mai-mai"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mcd-dictionary""}",3,"mai-mai,standard-qa,NABIT",3:NABIT,cip评价是什么意思,2026-03-17 17:28:26,2026-03-18
74460c80227d1a31dbf440178d369411,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,麦辣鸡翅最大炸制量是多少,2026-03-17 16:16:39,2026-03-18
cf3e0934a856144066b4800452a76dc6,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,新员工三家教育,2026-03-17 12:24:25,2026-03-18
5dd93457f147ed4b30274f4cf9f43a40,"{""1"": ""mcd-dictionary"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mai-mai""}",3,"mcd-dictionary,standard-qa,NABIT",3:NABIT,什么是模式,2026-03-17 14:28:12,2026-03-18
9ebb490f8f8c5bfa5a8ec9783d4ed341,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",4,"NABIT,mcd-dictionary,standard-qa,mai-mai",4:mai-mai,xinjiang,2026-03-17 15:08:40,2026-03-18
ac50901837f8296985e86301d95e04d5,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,值班排序,2026-03-17 16:05:52,2026-03-18
b6de6d190dfaaeb67ac3a879beee6ad1,"{""1"": ""standard-qa"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",2,"standard-qa,NABIT",2:NABIT,新员工三家教育,2026-03-17 12:27:06,2026-03-18
f4f8842888c2696c928b9a43be75200f,"{""1"": ""standard-qa"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",4,"standard-qa,NABIT,mcd-dictionary,mai-mai",4:mai-mai,环保排污的监督,2026-03-17 14:29:19,2026-03-18
23942782989711deba636c38d620e342,"{""1"": ""NABIT"", ""2"": ""standard-qa"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",4,"NABIT,standard-qa,mcd-dictionary,mai-mai",4:mai-mai,餐厅黄卡如果损坏应该如何更换,2026-03-17 07:09:44,2026-03-18
3944fe1397ba4a7f496571aff40465fc,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,v鸡翅摇篮时间,2026-03-17 17:36:20,2026-03-18
42f690412741d18ff62b2d4947874324,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,cip评价一般什么时候进行,2026-03-17 17:27:15,2026-03-18
b47a7f0779eb96826e7ee90b19d8cd40,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",4,"NABIT,mcd-dictionary,standard-qa,mai-mai",4:mai-mai,非食品处理,2026-03-17 16:27:16,2026-03-18
c8fafecc4cfd601744a1aa9c95ad615a,"{""1"": ""NABIT"", ""2"": ""standard-qa"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",4,"NABIT,standard-qa,mcd-dictionary,mai-mai",4:mai-mai,餐厅的黄卡如果损坏了，该如何更换,2026-03-17 07:21:33,2026-03-18
33ffc7f08e8084ce0f550a4efac81f32,"{""1"": ""standard-qa"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",2,"standard-qa,NABIT",2:NABIT,消毒水槽配比,2026-03-17 15:44:26,2026-03-18
939e1bb34e32287bdd813c8213543b9c,"{""1"": ""mai-mai"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mcd-dictionary""}",4,"mai-mai,standard-qa,NABIT,mcd-dictionary",4:mcd-dictionary,炒蛋煎炉设置英文与温度,2026-03-17 19:04:19,2026-03-18
e107ef7a284625a14e3406f5ef2e3c4e,"{""1"": ""standard-qa"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",2,"standard-qa,NABIT",2:NABIT,水电费预付费怎么申请？,2026-03-17 14:12:37,2026-03-18
4223164a9a7190b08e07048180096dad,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,24小时腌制时间,2026-03-17 19:26:15,2026-03-18
66518d7f857933bc2fa51c05b027bc53,"{""1"": ""NABIT"", ""2"": ""standard-qa"", ""3"": ""mcd-dictionary"", ""4"": ""mai-mai""}",4,"NABIT,standard-qa,mcd-dictionary,mai-mai",4:mai-mai,从SOK机上点餐怎么开发票,2026-03-17 17:59:11,2026-03-18
3c22f72ce66828710b062f370b382092,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",4,"NABIT,mcd-dictionary,standard-qa,mai-mai",4:mai-mai,系统图中的信号,2026-03-17 14:23:46,2026-03-18
3fcb8250a45a4a14be840cb92e6c2964,"{""1"": ""mai-mai"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mcd-dictionary""}",3,"mai-mai,standard-qa,NABIT",3:NABIT,新活动文件怎么转发到邮箱,2026-03-17 19:05:25,2026-03-18
c98ca5f7b1ed9e0aca8635126b077804,"{""1"": ""mcd-dictionary"", ""2"": ""NABIT"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",2,"mcd-dictionary,NABIT",2:NABIT,袖珍手册跟哪里找,2026-03-17 18:21:02,2026-03-18
44def8ab77ff140789788d8df846dfb4,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",4,"NABIT,mcd-dictionary,standard-qa,mai-mai",4:mai-mai,GAME模式,2026-03-17 21:57:28,2026-03-18
56039b13e25d71703efb5752ce630fa6,"{""1"": ""mai-mai"", ""2"": ""NABIT"", ""3"": ""mcd-dictionary"", ""4"": ""standard-qa""}",2,"mai-mai,NABIT",2:NABIT,麦乐送订单怎么查顾客手机号,2026-03-17 20:32:52,2026-03-18
9973d2a3921a7a501d1396462978af99,"{""1"": ""NABIT"", ""2"": ""mcd-dictionary"", ""3"": ""standard-qa"", ""4"": ""mai-mai""}",2,"NABIT,mcd-dictionary",2:mcd-dictionary,九宫格,2026-03-17 09:44:49,2026-03-18
d430c8ef158d98b4849246db0727a582,"{""1"": ""mcd-dictionary"", ""2"": ""standard-qa"", ""3"": ""NABIT"", ""4"": ""mai-mai""}",4,"mcd-dictionary,standard-qa,NABIT,mai-mai",4:mai-mai,2026袖珍手册,2026-03-17 08:27:55,2026-03-18
[Uploading decision_summary_20260317.csv…]()


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

















