---
type: paper
title: "Adaptive and robust low-rank tensor completion for missing and corrupted traffic data recovery"
title_zh: "用于缺失和损坏交通数据恢复的自适应和稳健低秩张量补全"
year: 2025
doi: "10.1080/15472450.2025.2576933"
openalex_id: "W4415686844"
status: unread
authors:
  - "Yang He"
  - "Huan Liu"
  - "Yuheng Jia"
  - "Chengchuan An"
  - "Weihua Zhang"
  - "Jingxin Xia"
topics:
  - "Tensor decomposition and applications"
  - "Traffic Prediction and Management Techniques"
  - "Sparse and Compressive Sensing Techniques"
---

# Adaptive and robust low-rank tensor completion for missing and corrupted traffic data recovery

> Spatiotemporal traffic data play a pivotal role in the operation of Intelligent Transportation Systems (ITS). In practice, missing values and anomalous observations are prevalent in field-collected measurements, undermining their effectiveness and utility in subsequent ITS applications. In order to improve the data quality, numerous low-rank tensor completion (LRTC) approaches have been developed, demonstrating promising performance. However, the high accuracy of existing LRTC approaches often depends on manually tuning key model parameters to accommodate varying missing data scenarios and diverse datasets. To overcome the practical limitation, this study propose a nonconvex LRTC model that incorporates an adaptive weighted nuclear norm framework for differentiated treatment of traffic data singular values. Within the framework, a heuristic logarithmic weighting function is employed to reduce manual hyperparameter tuning while maintaining effective regularization across diverse traffic scenarios. To further enhance robustness against corrupted data, the model is extended to a robust variant by integrating an anomaly-tolerant module based on the l1 norm, capable of simultaneously eliminating anomalous observations and imputing missing values. Extensive experiments demonstrate the effectiveness, robustness, and adaptivity of the proposed method. In general, the proposed method achieves up to a 10 % and 12 % performance improvement in missing data imputation and missing and corrupted data recovery tasks respectively compared to the existing nonconvex LRTC method.

## 中文翻译

### 用于缺失和损坏交通数据恢复的自适应和稳健低秩张量补全

时空交通数据在智能交通系统 (ITS) 的运行中发挥着至关重要的作用。在实践中，现场采集的测量数据中普遍存在缺失值和异常观测值，这削弱了它们在后续 ITS 应用中的有效性和实用性。为了提高数据质量，人们开发了许多低秩张量补全 (LRTC) 方法，这些方法表现出了令人鼓舞的性能。然而，现有LRTC方法的高精度通常取决于手动调整关键模型参数，以适应不同的缺失数据场景和多样化的数据集。为了克服这一实际限制，本研究提出了一种非凸LRTC模型，该模型结合了自适应加权核范数框架，用于对交通数据奇异值进行差异化处理。在该框架中，采用启发式对数加权函数来减少手动超参数调优，同时在各种交通场景下保持有效的正则化。为了进一步增强对损坏数据的鲁棒性，该模型通过集成基于 l1 范数的异常容忍模块扩展为鲁棒变体，该模块能够同时消除异常观测值并填补缺失值。大量实验表明，所提出方法的有效性、鲁棒性和适应性。总体而言，与现有的非凸LRTC方法相比，所提出的方法在缺失数据填补和缺失及损坏数据恢复任务中的性能分别提高了10%和12%。

## 我的笔记

# 面向缺失与损坏交通数据恢复的自适应鲁棒低秩张量补全算法

## 摘要
时空交通数据在智能交通系统ITS运行中重要。但实际采集数据时，缺失值与异常观测普遍，会降低数据质量，制约后续智慧交通应用的效果。

为提升数据质量，学界已经提出大量低秩张量补全（LRTC）算法。但现有低秩张量补全想要获得高精度，还需要人工反复调参，才能适配不同缺失场景、不同数据集。

本文提出：非凸低秩张量补全模型，引入**自适应加权核范数框架**，对交通数据的奇异值做差异化处理。框架内设计启发式对数加权函数，**减少人工超参数调参**，同时在各类交通场景下保持良好正则化效果。
进一步提升对损坏数据的 鲁棒性，基于$\(l_1\)$范数构建异常容忍模块，拓展得到鲁棒版本模型，可以同时完成异常点剔除和缺失值补全。

相较于现有非凸低秩张量补全方法，本文方法在缺失数据补全任务性能最高提升10%；在同时存在缺失+损坏的数据恢复任务上最高提升12%。

---------------------
研究这个的话，你需要有数据支撑：缺失/异常损失 带来的影响有什么，才能说你要解决这个问题
---------------------

## 研究背景与两大核心痛点
### 背景
完整可靠的交通数据是智慧交通的基础，能用于路网需求管理、交通状态估计、路网优化、排放计算。

传感器故障、通信故障、传输错误会造成数据**缺失**和**异常损坏**，严重影响后续应用。
低秩张量补全（LRTC）是当前主流交通数据补全技术：把交通数据构造成三阶张量（路段×时间间隔×天数），利用交通固有的时空相关性（体现为张量低秩特性）恢复丢失数据。

### 现存方法存在的两个关键问题：
#### C1：对不同交通变量、不同缺失场景的自适应能力不足
1. 流量、速度、占有率不同交通指挥，时空依赖特性不一样；随机缺失、块缺失（非随机缺失）等缺失模式下，模型最优参数不一样。
2. 现有非凸低秩模型（截断核范数TNN、Schatten-p范数等）必须人工调节截断比例、p值等关键超参数，换数据集、换缺失率就要重新网格搜索调参，工程落地麻烦。

**需要可以根据输入数据特性自动确定核心参数的自适应模型。**


#### C2：对破坏（异常污染）数据的鲁棒性不足
1. 现有大多数研究只解决**数据缺失**，很少处理传感器带来的非高斯异常噪声（离群点）。高斯噪声有成熟处理手段，但传感器故障带来的**脉冲异常**、**漂移异常**属于非高斯污染。

2. 如果前期预处理过滤异常，又需要额外设置过滤阈值，**阈值选择又引入新调参**；若不处理异常，**异常会污染补全结果带来偏差**，尤其是缺失率很高的时候偏差更大。

需要一套模型，不用前置数据预处理，同时实现缺失填补 + 异常剔除。
> 重要界定：本文只处理 **传感器故障产生的错误异常**；交通事故、拥堵事件产生真实交通异常，属于有效信号，不能当作异常去除。

### 本文主要3个贡献
1. 提出基于**自适应加权核范数（AWNN）的非凸低秩张量补全**框架LRTC-AWNN，用**对数加权函数** **自动**给**奇异值分配权重**，大幅减少人工调参，对奇异值差异化惩罚：保护代表周期、趋势的大奇异值，抑制代表噪声的小奇异值。
2. 增加** $\(l_1\)$ 稀疏异常容忍模块**，扩展得到鲁棒模型RLRTC-AWNN，**不需要额外预处理，同时修复缺失值、剔除传感器错误异常**。
3. 在5套真实交通数据集开展大量实验，验证有效性、鲁棒性、自适应性能。

# 三、相关工作

## 交通数据补全方法
1. 插值法：利用时空邻近值填充。简单，但只能适合缺失率很低场景，无法捕捉长周期时空规律。

2.预测类（神经网络）：用历史序列预测缺失。精度高，但需要大量训练数据，高度依赖原始数据质量。

3.统计学习/低秩矩阵 & 张量补全：
    - 张量分解类（CP、Tucker分解）：需要预先人为指定张量秩；秩设置好坏极大影响效果。
    - 秩最小化类：用凸 / 非凸函数近似张量秩。 传统核范数SNN对所有奇异值同等惩罚，会过度压制携带信息的大奇异值；截断核范数TNN等非凸方法效果好，但依赖人工调截断参数

> 本文工作：在和TNN同样的SNN（和模式展开核范数之和）框架基础上，把**固定截断改成自适应对数加权，再额外增加稀疏异常项**。

# 四、模型方法
## 4.1 问题定义
把交通数据组织三阶张量 $\(\mathcal Y\in\mathbb R^{m\times n\times f}\)$：m条路段，n个每日时间片，f 天。
    - **数据补全任务：**只恢复缺失位置；假设观测值全部正确。
    - **数据恢复任务：**同时处理：一部分数据缺失、一部分观测数据本身是传感器异常错误。
原始张量补全优化：$ \(min\ rank(\mathcal L),\ s.t.\ P_{\Omega}(\mathcal L)=P_{\Omega}(\mathcal Y)\) $
$\(\Omega\)$是观测位置集合，$\(P_\Omega\)$是投影算子。秩最小化是 NP 难，实际用核范数做近似。

## 4.2 LRTC-AWNN：自适应加权核范数张量补全（只做缺失补全）
自适应加权核范数AWNN
交通数据奇异值衰减比图像慢：
- 大奇异值：交通周/日周期、空间相关性（真实结构信息，应当少压缩）
- 小奇异值：噪声、扰动（要大力惩罚压缩）
- 中间奇异值：混杂信号和噪声。
***—— 这里我有个问题：为什么大奇异值就是有用的？多大算大，多小算小？***

定义矩阵自适应加权核范数：
$\(\|X\|_a=\sum_i w(\sigma_i)\sigma_i=\sum_i g(\sigma_i)\)$
- $\(\sigma_i\)$是矩阵奇异值；$\(w(\cdot)\)$自适应权重函数。
- 张量版本：对每个模式展开矩阵分别计算加权核范数再加权求和。

本文选用对数加权函数：
$\(w_{log}(\sigma_i)=\frac{\log(\sigma_i+1)}{\sigma_i}\)$
效果：大奇异值权重很小，几乎不收缩；中小奇异值适度收缩压制噪声。权重完全由当前迭代奇异值自动算出，不需要人工给定截断阈值。

> 可选其他加权形式（逆加权、多项式衰减加权），但在交通数据集对数加权综合表现最优。

目标函数：
$ \(\min_{\mathcal L}\|\mathcal L\|_a,\quad s.t.\ P_{\Omega}(\mathcal L)=P_{\Omega}(\mathcal Y)\) $
求解工具：**ADMM 交替方向乘子法**，引入辅助张量、拉格朗日乘子，拆分为多个子问题迭代求解，核心算子是加权奇异值阈值算子。

## 4.3 RLRTC‑AWNN 鲁棒扩展模型（缺失 + 损坏异常同时恢复）

上面 LRTC‑AWNN 假设观测数据没有错误。现实传感器有错误异常，新增稀疏异常张量\(\mathcal E_k\)，用\(l_1\)范数约束稀疏异常（只有少量位置是异常，其余为 0）。

目标函数：

\(\min_{\{\mathcal L_k,\mathcal E_k\},\mathcal M}\sum_{k=1}^3\alpha_k\|L_{k(k)}\|_a+\lambda_k\|\mathcal E_k\|_1\)

- \(\mathcal L\)：干净低秩交通张量；
- \(\mathcal E\)：稀疏错误异常张量（只捕获传感器错误点异常；真实事件异常不会被稀疏项消除）；
- \(\lambda_k\)：平衡低秩项和异常项的超参数。

依然用 ADMM 迭代求解，每一轮分别更新低秩分量\(\mathcal L\)、辅助张量\(\mathcal M\)、稀疏异常\(\mathcal E\)、拉格朗日乘子。异常\(\mathcal E\)使用软阈值算子更新。

> 
> 模型输出两个结果：①恢复后的干净交通张量\(\mathcal L\)；②识别出来的异常张量\(\mathcal E\)。
































## 引用的论文

- [[Bayesian Temporal Factorization for Multidimensional Time Series Prediction]]
- [[Missing data imputation for traffic flow based on combination of fuzzy neural network and rough set theory]]
- [[Missing traffic data imputation and pattern discovery with a Bayesian augmented tensor factorization model]]
- [[Tensor Robust Principal Component Analysis with a New Tensor Nuclear Norm]]
- [[Missing data detection and imputation for urban ANPR system using an iterative tensor decomposition approach]]
- [[Learning Spatiotemporal Latent Factors of Traffic via Regularized Tensor Factorization: Imputing Missing Values and Forecasting]]
- [[Innovative method for traffic data imputation based on convolutional neural network]]
- [[Matrix Completion Based on Non-Convex Low-Rank Approximation]]
- [[Traffic Data Reconstruction via Adaptive Spatial-Temporal Correlations]]
- [[A non-convex tensor rank approximation for tensor completion]]
- [[Spatial-temporal traffic speed patterns discovery and incomplete data recovery via SVD-combined tensor decomposition]]
- [[Data-Driven Imputation Method for Traffic Data in Sectional Units of Road Links]]
- [[Short-Term Traffic Prediction Based on Dynamic Tensor Completion]]
- [[Matrix and Tensor Based Methods for Missing Data Estimation in Large Traffic Networks]]
- [[An efficient realization of deep learning for traffic data imputation]]
- [[Estimating Missing Traffic Volume Using Low Multilinear Rank Tensor Completion]]
- [[Tensor based missing traffic data completion with spatial–temporal correlation]]
- [[Missing traffic data: comparison of imputation methods]]
- [[Weighted Nuclear Norm Minimization with Application to Image Denoising]]
- [[A Weighted Nuclear Norm Method for Tensor Completion]]
- [[A tensor-based method for missing traffic data completion]]
- [[Efficient missing data imputing for traffic flow by considering temporal and spatial dependence]]
- [[Imputing Erroneous Data of Single-Station Loop Detectors for Nonincident Conditions: Comparison Between Temporal and Spatial Methods]]
- [[PPCA-Based Missing Data Imputation for Traffic Flow Volume: A Systematical Approach]]
- [[A BPCA based missing value imputing method for traffic flow volume data]]
- [[Bayesian Time-Series Model for Short-Term Traffic Flow Forecasting]]

## 其他关系

- 暂无
