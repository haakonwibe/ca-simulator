// components/sankey/SankeyFunnel.tsx — Sankey/alluvial diagram for policy evaluation flow.
// React owns the <svg> container; D3 manages all SVG internals via useEffect.

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyLeft,
  type SankeyNode as D3SankeyNode,
  type SankeyLink as D3SankeyLink,
} from 'd3-sankey';
import { select } from 'd3-selection';
import { Zap } from 'lucide-react';

import { usePolicyStore } from '@/stores/usePolicyStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import { COLORS } from '@/data/theme';
import { buildSankeyData, STAGES } from './sankeyUtils';
import type { FlowNode, FlowLink } from './sankeyUtils';

// ── D3 layout types (after sankey mutates) ───────────────────────────

type LayoutNode = FlowNode & D3SankeyNode<FlowNode, FlowLink>;
type LayoutLink = FlowLink & D3SankeyLink<FlowNode, FlowLink>;

// ── Tooltip state ────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  policyNames: string[];
}

// ── Main component ───────────────────────────────────────────────────

export function SankeyFunnel() {
  const policies = usePolicyStore((s) => s.policies);
  const result = useEvaluationStore((s) => s.result);
  const setSelectedPolicyId = useEvaluationStore((s) => s.setSelectedPolicyId);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 350 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build a policyId → policyName map for tooltip display
  const policyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of policies) {
      map.set(p.id, p.displayName);
    }
    return map;
  }, [policies]);

  // Build Sankey data (memoized)
  const sankeyData = useMemo(
    () => buildSankeyData(result, policies),
    [result, policies],
  );

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 600),
        height: Math.max(height - 28, 250), // subtract stage header height
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Tooltip handlers
  const handleNodeHover = useCallback(
    (event: MouseEvent, node: LayoutNode) => {
      const names = node.policies.map((id) => policyNameMap.get(id) ?? id);
      setTooltip({
        x: event.offsetX,
        y: event.offsetY,
        title: node.label,
        subtitle: `${node.count} ${node.count === 1 ? 'policy' : 'policies'}`,
        policyNames: names,
      });
    },
    [policyNameMap],
  );

  const handleLinkHover = useCallback(
    (event: MouseEvent, link: LayoutLink) => {
      const names = link.policies.map((id) => policyNameMap.get(id) ?? id);
      const sourceLabel = (link.source as LayoutNode).label;
      const targetLabel = (link.target as LayoutNode).label;
      setTooltip({
        x: event.offsetX,
        y: event.offsetY,
        title: `${sourceLabel} → ${targetLabel}`,
        subtitle: `${link.value} ${link.value === 1 ? 'policy' : 'policies'}`,
        policyNames: names,
      });
    },
    [policyNameMap],
  );

  const handleNodeClick = useCallback(
    (node: LayoutNode) => {
      if (node.nodeType === 'verdict' && node.policies.length > 0) {
        setSelectedPolicyId(node.policies[0]);
      }
    },
    [setSelectedPolicyId],
  );

  const hideTooltip = useCallback(() => setTooltip(null), []);

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || !sankeyData) return;

    renderSankey(svgRef.current, sankeyData, dimensions, {
      onNodeHover: handleNodeHover,
      onLinkHover: handleLinkHover,
      onNodeClick: handleNodeClick,
      onMouseOut: hideTooltip,
    });
  }, [sankeyData, dimensions, handleNodeHover, handleLinkHover, handleNodeClick, hideTooltip]);

  // Empty state
  if (!result || !sankeyData) {
    return <EmptyState />;
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col overflow-hidden"
    >
      <StageHeaders width={dimensions.width} />
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          style={{ display: 'block' }}
        />
      </div>
      {tooltip && <SankeyTooltip {...tooltip} />}
    </div>
  );
}

// ── D3 imperative render ─────────────────────────────────────────────

interface RenderCallbacks {
  onNodeHover: (event: MouseEvent, node: LayoutNode) => void;
  onLinkHover: (event: MouseEvent, link: LayoutLink) => void;
  onNodeClick: (node: LayoutNode) => void;
  onMouseOut: () => void;
}

function renderSankey(
  svg: SVGSVGElement,
  data: { nodes: FlowNode[]; links: FlowLink[] },
  dimensions: { width: number; height: number },
  callbacks: RenderCallbacks,
) {
  const { width, height } = dimensions;
  const margin = { top: 8, right: 120, bottom: 16, left: 20 };

  // Deep-copy data (d3-sankey mutates input)
  const nodes: FlowNode[] = data.nodes.map((n) => ({ ...n }));
  const links: FlowLink[] = data.links.map((l) => ({ ...l }));

  // Build layout
  const layout = d3Sankey<FlowNode, FlowLink>()
    .nodeId((d) => d.id)
    .nodeWidth(20)
    .nodePadding(14)
    .nodeAlign(sankeyLeft)
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ]);

  const graph = layout({ nodes, links });
  const laidOutNodes = graph.nodes as LayoutNode[];
  const laidOutLinks = graph.links as LayoutLink[];

  // Clear previous render
  const root = select(svg);
  root.selectAll('*').remove();

  // --- Gradient defs for flow links (keyed by source-target IDs) ---
  const defs = root.append('defs');
  laidOutLinks.forEach((link) => {
    if (link.type === 'flow') {
      const sourceNode = link.source as LayoutNode;
      const targetNode = link.target as LayoutNode;
      const gradId = `sankey-grad-${sourceNode.id}-${targetNode.id}`;
      const gradient = defs
        .append('linearGradient')
        .attr('id', gradId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', sourceNode.x1 ?? 0)
        .attr('y1', 0)
        .attr('x2', targetNode.x0 ?? 0)
        .attr('y2', 0);
      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', sourceNode.color);
      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', targetNode.color);
    }
  });

  // --- Links ---
  const linkGroup = root.append('g').attr('fill', 'none');
  linkGroup
    .selectAll('path')
    .data(laidOutLinks.filter((l) => l.value > 0))
    .join('path')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', (d) => {
      if (d.type === 'flow') {
        const src = (d.source as LayoutNode).id;
        const tgt = (d.target as LayoutNode).id;
        return `url(#sankey-grad-${src}-${tgt})`;
      }
      return COLORS.textDim;
    })
    .attr('stroke-opacity', (d) => (d.type === 'flow' ? 0.4 : 0.2))
    .attr('stroke-width', (d) => Math.max(1, (d as LayoutLink).width ?? 1))
    .style('cursor', 'pointer')
    .on('mouseenter', function (event: MouseEvent, d: LayoutLink) {
      select(this).attr('stroke-opacity', d.type === 'flow' ? 0.7 : 0.4);
      callbacks.onLinkHover(event, d);
    })
    .on('mouseleave', function (_, d: LayoutLink) {
      select(this).attr('stroke-opacity', d.type === 'flow' ? 0.4 : 0.2);
      callbacks.onMouseOut();
    });

  // --- Nodes ---
  const nodeGroup = root.append('g');
  nodeGroup
    .selectAll('rect')
    .data(laidOutNodes)
    .join('rect')
    .attr('x', (d) => d.x0 ?? 0)
    .attr('y', (d) => d.y0 ?? 0)
    .attr('width', (d) => (d.x1 ?? 0) - (d.x0 ?? 0))
    .attr('height', (d) => Math.max(1, (d.y1 ?? 0) - (d.y0 ?? 0)))
    .attr('fill', (d) => d.color)
    .attr('rx', 3)
    .style('cursor', (d) => (d.nodeType === 'verdict' ? 'pointer' : 'default'))
    .on('mouseenter', function (event: MouseEvent, d: LayoutNode) {
      // Highlight connected links
      linkGroup
        .selectAll('path')
        .attr('stroke-opacity', (l) => {
          const link = l as LayoutLink;
          const src = link.source as LayoutNode;
          const tgt = link.target as LayoutNode;
          if (src.id === d.id || tgt.id === d.id) {
            return link.type === 'flow' ? 0.7 : 0.4;
          }
          return link.type === 'flow' ? 0.15 : 0.08;
        });
      callbacks.onNodeHover(event, d);
    })
    .on('mouseleave', function () {
      linkGroup
        .selectAll('path')
        .attr('stroke-opacity', (l) => {
          const link = l as LayoutLink;
          return link.type === 'flow' ? 0.4 : 0.2;
        });
      callbacks.onMouseOut();
    })
    .on('click', (_, d: LayoutNode) => callbacks.onNodeClick(d));

  // --- Verdict node glow ---
  nodeGroup
    .selectAll('.glow')
    .data(laidOutNodes.filter((d) => d.nodeType === 'verdict'))
    .join('rect')
    .attr('class', 'glow')
    .attr('x', (d) => (d.x0 ?? 0) - 2)
    .attr('y', (d) => (d.y0 ?? 0) - 2)
    .attr('width', (d) => (d.x1 ?? 0) - (d.x0 ?? 0) + 4)
    .attr('height', (d) => Math.max(1, (d.y1 ?? 0) - (d.y0 ?? 0)) + 4)
    .attr('fill', 'none')
    .attr('stroke', (d) => d.color)
    .attr('stroke-opacity', 0.3)
    .attr('rx', 5)
    .attr('filter', 'url(#glow)')
    .style('pointer-events', 'none');

  // Glow filter
  const glowFilter = defs.append('filter').attr('id', 'glow');
  glowFilter
    .append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'coloredBlur');
  const feMerge = glowFilter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // --- Labels ---
  const labelGroup = root.append('g');
  labelGroup
    .selectAll('text')
    .data(laidOutNodes)
    .join('text')
    .attr('x', (d) => {
      const nodeRight = d.x1 ?? 0;
      return nodeRight + 8;
    })
    .attr('y', (d) => ((d.y0 ?? 0) + (d.y1 ?? 0)) / 2)
    .attr('dominant-baseline', 'middle')
    .attr('font-family', 'JetBrains Mono, monospace')
    .style('pointer-events', 'none')
    .each(function (d) {
      const el = select(this);
      el.append('tspan')
        .text(d.label)
        .attr('font-size', '11px')
        .attr('fill', COLORS.text);
      el.append('tspan')
        .text(` (${d.count})`)
        .attr('font-size', '10px')
        .attr('fill', COLORS.textDim);
    });
}

// ── Stage headers ────────────────────────────────────────────────────

function StageHeaders({ width }: { width: number }) {
  const marginLeft = 20;
  const marginRight = 120;
  const usableWidth = width - marginLeft - marginRight;
  const stageCount = STAGES.length;
  const stageWidth = usableWidth / (stageCount - 1);

  return (
    <div className="relative shrink-0" style={{ width, height: 24 }}>
      {STAGES.map((label, i) => (
        <span
          key={label}
          style={{
            position: 'absolute',
            left: marginLeft + i * stageWidth,
            top: 4,
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: COLORS.textMuted,
            fontFamily: 'JetBrains Mono, monospace',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────

function SankeyTooltip({ x, y, title, subtitle, policyNames }: TooltipState) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x + 16,
        top: y - 12,
        backgroundColor: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '6px',
        padding: '8px 10px',
        pointerEvents: 'none',
        zIndex: 50,
        maxWidth: '280px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
      }}
    >
      <div style={{ color: COLORS.text, fontWeight: 600 }}>{title}</div>
      <div style={{ color: COLORS.textMuted, fontSize: '10px' }}>{subtitle}</div>
      {policyNames.length > 0 && (
        <div style={{ marginTop: 4, color: COLORS.textDim, fontSize: '10px' }}>
          {policyNames.slice(0, 5).map((name) => (
            <div key={name}>{name}</div>
          ))}
          {policyNames.length > 5 && <div>+{policyNames.length - 5} more</div>}
        </div>
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
      <Zap className="h-8 w-8" style={{ color: COLORS.textDim }} />
      <p
        className="text-center text-sm"
        style={{ color: COLORS.textMuted }}
      >
        Evaluate a scenario to see the policy flow
      </p>
    </div>
  );
}
