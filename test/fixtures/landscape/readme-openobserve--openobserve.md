<p align="center">
  <a href="https://openobserve.ai"><img src="https://openobserve.ai/img/logo/o2-logo-readme.svg" alt="OpenObserve"></a>
</p>
<p align="center">
    <em>Open source Datadog alternative for logs, metrics, traces, and frontend monitoring. Modern observability platform: 10x easier, 140x lower storage cost, high performance, petabyte scale.</em>
</p>
<p align="center">
<a href="https://github.com/openobserve/openobserve/releases" target="_blank">
    <img src="https://img.shields.io/github/v/release/openobserve/openobserve" alt="GitHub Release">
</a>
<a href="https://github.com/openobserve/openobserve/blob/main/LICENSE" target="_blank">
    <img src="https://img.shields.io/github/license/openobserve/openobserve" alt="License">
</a>
<a href="https://github.com/openobserve/openobserve/stargazers" target="_blank">
    <img src="https://img.shields.io/github/stars/openobserve/openobserve" alt="GitHub Stars">
</a>
<a href="https://github.com/openobserve/openobserve/graphs/contributors" target="_blank">
    <img src="https://img.shields.io/github/contributors/openobserve/openobserve" alt="Contributors">
</a>
<a href="https://github.com/openobserve/openobserve/issues" target="_blank">
    <img src="https://img.shields.io/github/issues/openobserve/openobserve" alt="GitHub Issues">
</a>
<a href="https://github.com/openobserve/openobserve/commits/main" target="_blank">
    <img src="https://img.shields.io/github/last-commit/openobserve/openobserve" alt="Last Commit">
</a>
</p>

<p align="center">
  <a href="https://cloud.openobserve.ai/">Cloud</a> ·
  <a href="https://openobserve.ai/docs/">Documentation</a> ·
  <a href="https://short.openobserve.ai/community">Slack</a> ·
  <a href="https://openobserve.ai/docs/quickstart/">Quickstart</a>
</p>

---

OpenObserve (O2) is a cloud-native observability platform for logs, metrics, traces, analytics, Real User Monitoring (RUM), and AI/LLM observability. It's a cost-effective alternative to Datadog, Splunk, and Elasticsearch for teams that need full observability without the complexity or cost — with Parquet columnar storage and an S3-native design that cuts storage costs by up to **140x**.

## Table of Contents

- [Why OpenObserve?](#why-openobserve)
- [Quick Start](#quick-start)
- [Product Tour](#product-tour)
- [Architecture](#architecture)
- [Comparisons](#comparisons)
- [Production Ready](#production-ready)
- [Security & Compliance](#security--compliance)
- [Enterprise Edition](#enterprise-edition)
- [Community & Support](#community--support)
- [Contributing](#contributing)
- [FAQ](#faq)
- [License](#license)
- [SBOM](#sbom)

## Why OpenObserve?

A single platform for all of your observability signals. Here's why teams choose OpenObserve:

| Benefit | Description |
| --- | --- |
| **140x lower storage cost** | Parquet columnar storage + S3-native architecture dramatically reduce costs vs Elasticsearch |
| **Single binary deployment** | Up and running in under 2 minutes — no complex cluster setup required |
| **OpenTelemetry native** | Built on the OpenTelemetry standard — no vendor lock-in |
| **Unified platform** | Logs, metrics, traces, RUM, dashboards, alerts, and incidents in one tool |
| **High performance** | Better query performance than Elasticsearch on a quarter of the hardware |
| **SQL + PromQL** | Query logs and traces with SQL, metrics with SQL or PromQL — no proprietary query language |
| **Built in Rust** | Memory-safe, high-performance, single binary |

**Cost comparison: OpenObserve vs Elasticsearch**

![OpenObserve vs Elasticsearch storage cost comparison](./screenshots/zo_vs_es.png)

## Quick Start

### OpenObserve Cloud (fastest way)

Get started in minutes without managing infrastructure. The free tier includes up to 50 GB/day of ingestion.

**[Get Started Free →](https://cloud.openobserve.ai/)**

### 🐳 Docker

```bash
docker run -d \
      --name openobserve \
      -v $PWD/data:/data \
      -p 5080:5080 \
      -e ZO_ROOT_USER_EMAIL="root@example.com" \
      -e ZO_ROOT_USER_PASSWORD="Complexpass#123" \
      public.ecr.aws/zinclabs/openobserve:latest
```

Then open [http://localhost:5080](http://localhost:5080) and log in with the credentials above.

For other installation methods, see the [quickstart documentation](https://openobserve.ai/docs/quickstart). For clustered deployments, see the [High Availability deployment guide](https://openobserve.ai/docs/ha_deployment/).

## Product Tour

OpenObserve ships with a powerful, unified web UI for every signal — logs, traces, metrics, dashboards, RUM, alerts, incidents, pipelines, and AI observability.

[![Watch the OpenObserve introduction video](./screenshots/o2_intro.webp)](https://www.youtube.com/watch?v=9V0YQJKDCA8)

### 🏠 Unified Overview

A single home for your workspace — active incidents, service health (error rate, latency, requests), anomalies, and recent events at a glance.

![OpenObserve home overview](./screenshots/home.png)

### 📊 Logs

Centralized log management with full-text search, SQL queries, quick filters, and a visual query builder. Instantly search across all your logs, build dashboards from log data, and set up alerts — all on Parquet columnar storage for 140x lower storage cost than Elasticsearch. [Read more →](https://openobserve.ai/logs/)

![Logs search with histogram and field explorer](./screenshots/logs.png)

### 🔍 Distributed Tracing

Powered by OpenTelemetry, tracing helps you follow requests across services and pinpoint performance bottlenecks. Explore the full request flow with waterfalls, flame graphs, and Gantt charts; click any span to drill into the trace. [Read more →](https://openobserve.ai/traces/)

![Distributed trace waterfall view](./screenshots/traces.png)

### 🕸️ Service Graph

Visualize service-to-service dependencies and request flow across your system, with per-edge request counts and health-based coloring (healthy, degraded, warning, critical) to spot problem hotspots at a glance.

![Service dependency graph](./screenshots/service-graph.png)

### 📈 Metrics

Explore metrics from your infrastructure and applications, then query them with SQL or PromQL. Browse thousands of metrics with faceted filters, preview them inline, combine multiple queries with formulae, and visualize the results with 19+ chart types. [Read more →](https://openobserve.ai/metrics/)

![Metrics explorer browsing metric time series](./screenshots/metrics.png)

### 📉 Dashboards

Build custom dashboards from any signal with 19+ built-in chart types and 200+ visualization variations, a drag-and-drop panel builder, template variables, and geo maps. [Read more →](https://openobserve.ai/dashboards/)

![Kubernetes namespace dashboard with template variables](./screenshots/dashboards.png)

### 👀 Frontend Monitoring (RUM)

Real User Monitoring with Core Web Vitals, error tracking, performance analytics, and full session replay — so you can see exactly what your users experience. [Read mo