**Model routing is the practice of intelligently choosing the best model at the lowest cost for each incoming AI request, rather than using a single model for every request.**

A router is distinct from an AI gateway, which provides access to various AI models. With agent inference spend exploding and single coding-agent sessions burning through what used to be an entire month's budget, intelligent model routing is fast becoming one of the most important layers of modern AI infrastructure.

This guide is for engineering and platform leaders who are trying to understand what routing actually is, how to think about the difference between a router and a gateway, and where routing fits into the agentic stack.

![Model router pareto curve](https://cdn.sanity.io/images/tz56nmh3/production/a50335e632361f3b16c2f2b3d0c6340c28e65b66-1984x1446.png)

## **What is model routing?**

Model routing is a decision layer that sits between an AI application and a pool of AI models. When a request comes in, the router decides which model should handle it. That decision can be made in different ways—by static rules, by a classifier, by a learned policy, or by a cascade—but the core idea is the same: instead of being locked into one model for every request, you match the request to the model best suited to it.

Routing can be decomposed into three core dimensions:

1.  The models: Which models are available to route to? This might be two models from a single provider (e.g., Claude Haiku and Claude Opus), or it might be dozens of models across proprietary and open-source providers.
2.  The signal: What information does the router use to make its decision? This can range from simple heuristics (prompt length, user tier) to semantic classifiers to learned predictors of model quality.
3.  The objective: What is the router optimizing for? Cost? Quality? Latency? A weighted combination?

Different routing solutions entail different choices across all three dimensions, and the right choice depends heavily on the workload.

## **Gateways vs. routers: breaking down the difference**

As an emerging category, routing often suffers from confused terminology. Products often call themselves "gateways" or "routers" interchangeably. The distinction between these two is simple:

**A gateway gives you access to models. A router determines which one to use.**

A gateway is a unified interface. It gives your application one API to call instead of many, handles authentication against a pool of providers, normalizes request and response formats, and can provide unified billing. The value of a gateway is consolidation: you no longer maintain N integrations against N providers, and you get organizational controls over how those providers are used. But the gateway doesn't decide which model to use. That decision is hardcoded in your application.

A router decides when to use which model. It takes an incoming request and dynamically selects the model that should handle it. The value of a router is optimization: you stop paying for the strongest model on the steps that don't need it, and you get the aggregate benefits of a heterogeneous model pool without having to manually orchestrate which model serves which query.

Gateways and routers are not competing categories, and production AI stacks need both.

## **Why model routing is essential for agents**

In the last year, routing has evolved from an optimization lever used only by the most sophisticated teams to critical infrastructure for enterprises to manage the explosion of coding agent inference spend. Claude Code, Codex, Cursor, OpenClaw, OpenCode, Cline, Aider, OpenHands, Pi, and a growing tail of in-house and open-source harnesses are now deployed across engineering organizations with a voracious appetite for tokens, and managing these costs is quickly becoming a top priority for AI, IT, and finance teams.

A single Claude Code session can consume upwards of 1M tokens per minute for hours at a time, and many companies are now burning through annual coding agent budgets in less than a quarter. The problem is only getting worse: frontier models are getting more expensive and more capable, meaning agents run longer and incur more cost on each task. Meanwhile, the cheapest models are also getting better, expanding the opportunity cost of relying exclusively on top models.

Because coding agent workloads are variable in complexity, when a single frontier model handles everything you are by definition overpaying on the easy steps to insure against the hard ones. A router that dynamically matches the model to each request offers teams the ability to radically reduce cost without sacrificing quality. While coding agents are the most visible example, this is true for any workflow where tasks vary in complexity, including customer support agents, research agents, chatbots, and RAG systems.

## **The value of intelligent routing: performance, cost, resilience**

The case for intelligent routing rests on three benefits, in roughly this order of importance.

#### Cost

The primary benefit of routing is its ability to drive significant cost savings while maintaining quality. Savings from model routing can range anywhere from 20% to 95% depending on the use case and models, but the underlying mechanic is consistent: most workloads contain a long tail of simple requests that don't need the strongest model in the pool. Routing those requests to cheaper models while reserving the expensive models for the steps that actually need them closes the gap between what teams are spending and what they'd spend under an optimal policy. Savings compound with agentic workloads, where a single user request can generate hundreds of downstream model calls.

#### Quality

Another important benefit of intelligent routing is that it can outperform individual models on quality. While frontier models may achieve similar aggregate scores on a given benchmark, the breakdown of how each model performs on sub-categories and individual requests is typically more uneven. By sending each request to the strongest model, routing can achieve accuracy gains of anywhere from 5-20% over the best individual model. This is a natural consequence of heterogeneous model strengths.

#### Latency

Smaller models can be much faster, and more powerful models can have different reasoning effort settings which impact response times. Routing latency-sensitive queries to the fastest model that can handle them produces a more responsive application. This typically matters most for chat and voice use cases and requires a routing solution which does not add more latency than it saves.

## **Cache-aware routing**

One of the most important aspects of routing is the interaction between routing decisions and prompt caching.

When an agent sends a request with a large shared prefix (prior messages, system prompt, tool schemas), the provider caches that prefix and charges a fraction of the standard input price on subsequent hits. For long-running coding sessions, maintaining the cache is critical to good tokenomics: a cache read is typically around 10% of the uncached input cost. If a router sends ten turns to Model A and the next turn to Model B, the new model has to re-process the entire context uncached, and the total cost can exceed what you would have paid by staying on the more expensive model. A router that is unaware of the cache is routing against a misleading cost function.

Cache-aware routing treats the cache as a first-class input to the routing decision. A good router should track when the cache is actually warm and when it has broken on TTL expiry (commonly 5 minutes), context compaction, media attachments, or any edit to the prefix. It also leverages sub-agent routing to benefit from cheaper models on narrower tasks. And it weighs cache economics against routing economics, which depends on both conversation length and pool composition: short conversations don't accumulate enough cache for preservation to matter, pools made up of a single strong model and multiple cheap models let you keep the cache warm on the strong model and only escalate when needed, and cheap-only pools can allow you to maximize quality at every turn because the underlying token cost is low for every option.

A router that looks great on single-turn evaluations can lose all of its paper savings on a real coding session because it hasn't accounted for the cache. This is one of the clearest places where routing for agentic workloads diverges from routing for chat, and it's an essential feature for any routing solutions that you want to leverage in agentic settings.

## **Where routing fits in the agentic stack**

For teams using coding agents at scale or building agentic systems, the right mental model is to think about routing at multiple levels of the workflow.

**At the session level.** Some agent sessions are simple (fix a typo, rename a variable) and some are complex (refactor a module, debug a distributed system issue). A session-level router can determine which model to anchor the session on.

**At the sub-agent level.** Coding harnesses and other agentic systems often spin up sub-agents to parallelize work or isolate specific subtasks. Each sub-agent has its own context and its own profile of demands. Sub-agent-level routing picks the right model for each spawned worker.

**At the task level.** Within a session or sub-agent, an agent typically decomposes work into tasks. A planning task is different from a code-generation task, which is different from a summarization task. Users may also switch tasks midway through a session. Task-level routing picks the right model for each.

**At the step level.** Inside a task, individual steps vary even more. Interpreting the results of a tool call has different requirements than a reasoning step that proposes a fix.

## **Deterministic routing vs. intelligent routing**

Dynamic routing can be broken down into two types: deterministic routing and intelligent routing.

**Deterministic routing** relies on pre-defined rules to determine which model to route to without considering the content of requests. This includes static multi-model orchestration ("use Haiku in the summarization step"), fallback routing ("fallback to a different model if latency exceeds 2 seconds"), and load balancing ("send 50% of traffic to inference provider A and 50% to inference provider B"). Deterministic routing is generally used to improve _reliability_ and _predictability_.

**Intelligent routing** makes routing decisions by analyzing the input itself. The router examines the content of the request—using a classifier, an embedding model, a cascading check, or a learned policy—and predicts which model in the pool will best satisfy the objective for the specific prompt. Intelligent routing is generally used to improve _cost_ and _quality_.

These categories are distinct and complementary, and production settings benefit from both: an intelligent router making the primary decision for cost and quality, with deterministic fallbacks for catching failures.

## **How intelligent model routing works**

Intelligent routers use several different techniques to convert inputs into model recommendations.

#### Heuristic routing

The simplest approach to routing is to hard-code rules based on surface features of the prompt (keyword matches, prompt length, regex patterns). This approach is fast to set up but brittle. It struggles with semantic nuance, breaks on edge cases, and becomes hard to maintain as the number of rules grows. It can be useful as a first pass, but it is rarely sufficient as a primary routing mechanism.

#### Semantic routing

In semantic routing, decisions are defined by example phrases which are embedded into vectors at setup time. At runtime, the incoming prompt is embedded and matched against the phrase vectors via cosine similarity, and the closest-matching route wins. This approach is fast, scalable to many routes, and more robust than keyword matching because it understands meaning. The main limitations are that it's only as good as the example phrases provided, it requires maintenance as semantic categories and corresponding model capabilities evolve, and it can struggle with multi-turn conversational context where the salient intent isn't in the latest message.

#### LLM-based routing

The router is itself an LLM that reads the incoming prompt and classifies it into a category, then hands the original prompt off to the model associated with that category. This approach is flexible, can handle nuance better than heuristic routing, and can adapt to new routing tasks via prompt changes. The problem however is that this architecture is often self-defeating because it requires adding a full LLM inference call to the critical path of every request, which adds the cost and latency teams seek to eliminate in the first place. Teams wanting to make use of LLM-based routing should be prepared to invest in finetuning their LLM classifier to achieve scalability and ROI.

#### Complexity classifier routing

A trained classifier estimates the difficulty of each incoming request and then routes to a model sized to that difficulty. Simple requests go to cheap models; complex ones escalate to more powerful models. This approach is faster and cheaper than LLM-based routing because the classifier is small, and it generalizes better than heuristic routing. The main limitation is that complexity is a coarse signal: two requests with identical complexity scores may have very different model fits because difficulty alone doesn't capture domain specialization. Additionally, as model capabilities evolve and new models are released, the classifier must be constantly retrained.

#### Predictive routing

A learned model—trained on benchmarks, internal evaluations, or production traffic—predicts how each candidate model will perform on a given prompt, then picks the one with the best predicted outcome for the chosen objective, typically expressed as a weighted tradeoff across quality, cost, and/or latency. Unlike the former approaches where routing decision trees are constructed manually, this approach is data-driven by default. As a result, this architecture offers the most upside for exploiting the Pareto frontier, because it actually learns the strengths and weaknesses of each model in the pool rather than relying on static assumptions. It's also harder to build, because you need good training signal and a way to measure success.

#### Cascade routing

In cascade routing, a request is sent to the cheapest model first. If the output is good enough—whether judged by a confidence score, a secondary check, or a verification mechanism—then it is accepted and returned. If it isn't, then it's escalated to a stronger model. Cascading is conservative with cost and provides a natural quality backstop. However, it requires a verification method which is as cheap or cheaper than the cheap model itself. It also cannot be leveraged in latency-sensitive applications given that cascades may require multiple sequential LLM calls per request.

In practice, production routers are often compositional—a cascade layered on top of a predictive classifier, or semantic routing with deterministic keyword checks. The right combination depends on the workload, the models in the pool, and how sensitive the application is to cost, latency, and quality.

## **How to evaluate a model routing solution**

If you're in the market to buy or build a router, here are the questions you should use to evaluate solutions:

**What does the router base model recommendations on?** If it only routes on headers, rules, or availability, it's a deterministic router. That might be all you need—but know what you're buying. If it routes on the content of the prompt, ask how: classifier, semantic, predictive, cascading?

**What's the pool?** Is it locked to one provider? Does it cover both proprietary and open-source models? How quickly can new models be added?

**What's the objective function?** Can you express preferences over cost, quality, and latency, or does the router optimize for a single dimension only?

**What's the overhead?** The router itself has a latency and cost. If it adds 1s and $0.10 to every request, it's probably eating much of the value it creates.

**Is it vendor-neutral?** Routers that are neutral across providers tend to deliver more value over time than ones locked to a single provider's catalog, because the model landscape shifts constantly. The best model for your workload six months from now may not be from your current preferred provider.

**Can it handle agentic workloads specifically?** Session-level context, tool schemas, prompt caching, and long-context behavior all matter. A router that does well on single-turn chat may not handle an agent loop gracefully.

**Is it cache-aware?** For agentic workloads, this is decisive. A router that doesn't account for cache state can route you to a cheaper model whose uncached input tokens cost more than the cache read you just abandoned. Ask specifically how the router handles cache TTL expiry, compaction events, and subagent-level routing.

## **The future of model routing**

Over the past few years, model routing has grown from an academic interest to an optimization lever to critical infrastructure for the agentic era. As the model landscape keeps fragmenting, model routing will only become more important over time. The teams that treat routing as core infrastructure today will be positioned to scale at the speed of the frontier tomorrow.

Routing offers companies significant leverage in a world where inference is becoming the currency of market value, and more inference means more value. More than this, routing helps drive our industry towards a less monopolistic, more modular, and more energy efficient future. Routing is the layer that enables everyone to benefit from distributed intelligence instead of having to rely on a single monolithic model. That’s a future worth building.

## **Frequently asked questions**

#### Is a model router the same as an AI gateway?

No. A gateway is an access layer (API normalization, auth, rate limits, failover); a router is a decision layer (which model handles this request). AI development stacks require both, but the functions are distinct, and most "gateway" products typically do only deterministic routing—rules and fallbacks rather than dynamic per-request selection.

#### How much can model routing actually save?

Savings can range from 20% to 95% on inference costs, with the realized savings depending heavily on workload shape, the spread of capability and price across the model pool, and how well the router is tuned. The single biggest factor is how much of your traffic is simple enough that a cheaper model handles it without quality loss.

#### What other techniques can I use to reduce Claude Code / Codex / OpenClaw costs?

Beyond routing, the three biggest levers are context management, context compaction, and contract negotiation. Keep [CLAUDE.md](http://claude.md/) or [AGENTS.md](http://agents.md/) files focused and delegate verbose tool output to sub-agents. Context compaction uses aggressive summarizing to reduce overall token consumption over the course of long sessions. Contract negotiation is the lever most teams overlook: at meaningful volume, providers will negotiate on rate, committed-use discounts, and cache pricing.

#### Does routing hurt quality?

It can, if it's tuned poorly. Done well, routing often improves quality over a single-model baseline, because it lets specialized models handle queries they're stronger on. The key is measurement—without per-request quality signal, you can't tell whether the router is helping or hurting.

#### What's the difference between routing and mixture-of-experts (MoE)?

MoE routes tokens among expert sub-networks inside a single model, as an architectural choice made at training time. Model routing routes entire requests among multiple independently trained models, as a system-level choice made at inference time. They're analogous but operate at different levels of the stack.

#### What's the difference between model routing and multi-agent routing?

Model routing selects which LLM handles a given request. Multi-agent routing selects which specialized agent handles a given task in a multi-agent workflow—for example, dispatching a customer query to a billing agent versus a technical support agent. The two are complementary and often coexist in production systems, with multi-agent routing determining the agent and model routing determining the model that agent calls to do its work.

#### Do I need a router if I only use one provider?

Even within a single provider, routing between model sizes (e.g., Haiku vs. Sonnet vs. Opus) and reasoning effort levels (low, medium, high, xhigh, max) captures meaningful savings. Multi-provider routing offers even greater benefits, but single-provider routing is a reasonable starting point.

#### Is routing worth it if I'm not spending much on inference yet?

Not as a standalone investment. Routing's ROI scales with spend. The calculus changes fast once agentic workloads push spend into the hundreds or thousands per developer per month.

#### Can I build my own router?

Yes, and many teams do start with a homegrown one—usually some if/else logic around prompt length and keywords. The failure mode is the same as with most infrastructure: a custom solution gets built, nobody maintains it, the model landscape shifts, and the solution becomes silently obsolete. The right question isn't "can I build this" but "is routing core enough to my product that owning the infrastructure pays for itself."