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

2.如果前期预处理过滤异常，又需要额外设置过滤阈值，阈值选择









































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
