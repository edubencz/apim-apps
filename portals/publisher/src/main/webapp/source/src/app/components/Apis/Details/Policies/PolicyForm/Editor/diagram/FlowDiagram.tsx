/*
 * Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, {
    FC, useEffect, useMemo, useRef, useState, WheelEvent, MouseEvent as ReactMouseEvent,
} from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import OutlinedFlagRounded from '@mui/icons-material/OutlinedFlagRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import AutoAwesomeMosaicOutlined from '@mui/icons-material/AutoAwesomeMosaicOutlined';
import { useTheme, alpha } from '@mui/material/styles';
import { FormattedMessage, useIntl } from 'react-intl';
import { layoutFlow, LayoutBox, computeGroups } from './layout';
import {
    getMediatorCatalogEntry, getMediatorAccentColor, getMediatorChips,
} from './mediatorCatalog';
import { getMediatorIcon } from './iconRegistry';
import type { FlowNode } from '../types';

export interface TraceEntry {
    nodeId: string;
    order: number;
}

interface FlowDiagramProps {
    nodes: FlowNode[];
    selectedNodeId?: string | null;
    onNodeClick?: (node: FlowNode) => void;
    /** Executed nodes, numbered in execution order */
    trace?: TraceEntry[];
    /** nodeId where execution ended (e.g. a <respond/> or <drop/>) */
    endedAtNodeId?: string;
    /** nodeId where a fault was raised (highlighted with a red outline + "Fault" chip) */
    faultNodeId?: string;
    /** When set, the diagram renders `nodes` (the last known-valid parse) dimmed, with a banner
     * pointing at the current XML error so the canvas never goes blank while typing. */
    staleBanner?: { line: number };
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

// Item 1 (UX polish): SVG <text> does not inherit the app's font the way HTML does unless a
// font-family is set explicitly somewhere in its ancestry - left unset, node titles/subtitles
// were rendering in the browser's serif fallback. The monospace stack mirrors what Monaco uses
// elsewhere in the editor, so mediator summaries ("post {{token_url}}", scopes, media types...)
// read visually as "code" while titles stay in the app's UI font.
const MONO_FONT_FAMILY = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
/** Matches a `{{ expr }}` jinja token so it can be rendered with an accent-colored <tspan>. */
const VARIABLE_TOKEN_RE = /(\{\{[^{}]*\}\})/g;

const BRANCH_TINTS: Record<string, { light: string; dark: string; pillLight: string; pillDark: string }> = {
    then: {
        light: '#16a34a', dark: '#4ade80', pillLight: 'rgba(22,163,74,0.12)', pillDark: 'rgba(74,222,128,0.16)',
    },
    else: {
        light: '#dc2626', dark: '#f87171', pillLight: 'rgba(220,38,38,0.10)', pillDark: 'rgba(248,113,113,0.14)',
    },
    default: {
        light: '#64748b', dark: '#94a3b8', pillLight: 'rgba(100,116,139,0.10)', pillDark: 'rgba(148,163,184,0.14)',
    },
};

function branchTint(branchKey: string | undefined, mode: 'light' | 'dark') {
    if (!branchKey) return BRANCH_TINTS.default;
    if (branchKey === 'then') return BRANCH_TINTS.then;
    if (branchKey === 'else') return BRANCH_TINTS.else;
    if (branchKey.startsWith('case')) {
        return {
            light: '#b45309', dark: '#f59e0b', pillLight: 'rgba(180,83,9,0.12)', pillDark: 'rgba(245,158,11,0.16)',
        };
    }
    return BRANCH_TINTS.default;
}

/**
 * Builds a smooth "elbow" path (vertical - horizontal - vertical) with rounded corners between
 * two points, used for every edge on the canvas. Falls back to a straight vertical line when the
 * two points already share an x coordinate (the common case in a linear run).
 * @param {number} x1 Source x
 * @param {number} y1 Source y
 * @param {number} x2 Target x
 * @param {number} y2 Target y
 * @param {number} radius Corner radius
 * @returns {string} An SVG path `d` attribute
 */
function elbowPath(x1: number, y1: number, x2: number, y2: number, radius = 10): string {
    if (Math.abs(x1 - x2) < 1) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const midY = (y1 + y2) / 2;
    const r = Math.min(radius, Math.abs(y2 - y1) / 2 - 1, Math.abs(x2 - x1) / 2);
    const sign = x2 > x1 ? 1 : -1;
    return [
        `M ${x1} ${y1}`,
        `L ${x1} ${midY - r}`,
        `Q ${x1} ${midY} ${x1 + sign * r} ${midY}`,
        `L ${x2 - sign * r} ${midY}`,
        `Q ${x2} ${midY} ${x2} ${midY + r}`,
        `L ${x2} ${y2}`,
    ].join(' ');
}

/**
 * Item 2 (UX polish): splits a mediator summary on `{{ }}` jinja tokens and renders each as its
 * own `<tspan>`, highlighting the token in the accent color so a value like
 * `post {{token_url}}` visually calls out the variable part. Plain text segments render in the
 * base (secondary) text color. Falls back to a single plain `<tspan>` when there's no token.
 * @param {string} text The (already truncated) summary text
 * @param {string} baseFill Fill color for the non-token segments
 * @param {string} accentFill Fill color for the `{{ }}` token segments
 * @returns {TSX[]} An array of `<tspan>` elements, safe to spread as `<text>` children
 */
function renderSummaryTspans(text: string, baseFill: string, accentFill: string): React.ReactNode[] {
    const parts = text.split(VARIABLE_TOKEN_RE).filter((part) => part.length > 0);
    return parts.map((part, i) => {
        const isToken = VARIABLE_TOKEN_RE.test(part) && part.startsWith('{{');
        // .test() above advances VARIABLE_TOKEN_RE's lastIndex (it's a global regex) - reset it
        // so the next call's match isn't skipped.
        VARIABLE_TOKEN_RE.lastIndex = 0;
        return (
            // eslint-disable-next-line react/no-array-index-key
            <tspan key={`${i}-${part.slice(0, 8)}`} fill={isToken ? accentFill : baseFill} fontWeight={isToken ? 600 : 400}>
                {part}
            </tspan>
        );
    });
}

/**
 * Hand-rolled SVG flow diagram (no charting dependency) for a parsed Synapse mediation sequence:
 * rounded "card" nodes with a category accent bar and icon, branch lanes for filter/switch, a
 * collapsible "Properties xN" stack for long runs of property/header mediators, pan (drag) and
 * ctrl+wheel zoom with a floating zoom toolbar, and an execution-trace overlay (numbered executed
 * nodes/edges, dimmed un-executed ones, fault/ended markers and a small legend).
 * @param {FlowDiagramProps} props Component props
 * @returns {TSX} The rendered flow diagram
 */
const FlowDiagram: FC<FlowDiagramProps> = ({
    nodes, selectedNodeId, onNodeClick, trace, endedAtNodeId, faultNodeId, staleBanner,
}) => {
    const theme = useTheme();
    const intl = useIntl();
    const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const allGroups = useMemo(() => computeGroups(nodes), [nodes]);
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

    const traceByNodeId = useMemo(() => {
        const map = new Map<string, number>();
        (trace || []).forEach((t) => map.set(t.nodeId, t.order));
        return map;
    }, [trace]);
    const hasTrace = Boolean(trace && trace.length > 0);

    // Auto-expand whichever group contains the fault/ended node, so the trace overlay never hides
    // the node it needs to point at.
    useEffect(() => {
        const target = faultNodeId || endedAtNodeId;
        if (!target) return;
        const owner = allGroups.find((g) => g.nodeIds.includes(target));
        if (owner) {
            setExpandedGroupIds((prev) => (prev.has(owner.id) ? prev : new Set(prev).add(owner.id)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [faultNodeId, endedAtNodeId, allGroups]);

    const layout = useMemo(
        () => layoutFlow(nodes, { expandedGroupIds }),
        [nodes, expandedGroupIds],
    );

    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 24, y: 24 });
    const dragState = useRef<{
        startX: number; startY: number; panX: number; panY: number; moved: boolean;
    } | null>(null);

    const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

    // "Fit to view" (the toolbar button): shrinks to fit the whole diagram - width AND height -
    // in the visible canvas at once, useful to get an overview of a long/branchy flow.
    const fitToView = () => {
        const container = containerRef.current;
        if (!container || layout.width === 0) return;
        const availableWidth = container.clientWidth - 48;
        const availableHeight = container.clientHeight - 48;
        const nextScale = clampScale(Math.min(
            availableWidth / layout.width,
            availableHeight / layout.height,
            1,
        ));
        setScale(nextScale);
        setPan({
            x: (container.clientWidth - layout.width * nextScale) / 2,
            y: 24,
        });
    };

    // Initial render = fit WIDTH only (per design spec) - a long policy simply scrolls/pans
    // vertically instead of shrinking every card down to illegible size just to also fit height.
    const fitWidth = () => {
        const container = containerRef.current;
        if (!container || layout.width === 0) return;
        const availableWidth = container.clientWidth - 48;
        const nextScale = clampScale(Math.min(availableWidth / layout.width, 1));
        setScale(nextScale);
        setPan({
            x: (container.clientWidth - layout.width * nextScale) / 2,
            y: 24,
        });
    };

    // Initial render = fit width (and whenever the parsed flow's shape changes materially).
    useEffect(() => {
        fitWidth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout.width, layout.height]);

    const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        setScale((prev) => clampScale(prev + delta));
    };

    const handleMouseDown = (event: ReactMouseEvent<SVGSVGElement>) => {
        dragState.current = {
            startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false,
        };
    };
    const handleMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
        if (!dragState.current) return;
        const dx = event.clientX - dragState.current.startX;
        const dy = event.clientY - dragState.current.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.current.moved = true;
        setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
    };
    const handleMouseUp = () => {
        dragState.current = null;
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
            return next;
        });
    };

    const renderChips = (x: number, y: number, chips: { label: string }[], accent: string) => {
        let cx = x;
        return chips.slice(0, 2).map((chip) => {
            const w = Math.min(120, 12 + chip.label.length * 6.2);
            const el = (
                <g key={`${chip.label}-${cx}`}>
                    <rect
                        x={cx}
                        y={y}
                        width={w}
                        height={16}
                        rx={8}
                        fill={alpha(accent, mode === 'dark' ? 0.22 : 0.12)}
                    />
                    <text
                        x={cx + w / 2}
                        y={y + 11.5}
                        textAnchor='middle'
                        fontSize={9.5}
                        fontFamily={MONO_FONT_FAMILY}
                        fill={accent}
                    >
                        {chip.label.length > 16 ? `${chip.label.slice(0, 15)}…` : chip.label}
                    </text>
                </g>
            );
            cx += w + 4;
            return el;
        });
    };

    const renderNodeCard = (
        box: LayoutBox,
        node: FlowNode,
        opts: {
            stacked?: boolean; groupSize?: number; groupId?: string; groupOrders?: number[];
            forceFault?: boolean; forceEnded?: boolean;
        } = {},
    ) => {
        const catalogEntry = getMediatorCatalogEntry(node.tag);
        const accent = getMediatorAccentColor(node.tag, mode);
        const Icon = getMediatorIcon(catalogEntry.icon);
        const fullSummary = node.summary || node.tag;
        const tooltipTitle = `${catalogEntry.label}: ${fullSummary}`;
        const chips = getMediatorChips(node.tag, node.attrs);

        const order = traceByNodeId.get(box.nodeId);
        const executedSelf = order !== undefined;
        const groupExecutedOrders = opts.groupOrders;
        const executed = executedSelf || Boolean(groupExecutedOrders && groupExecutedOrders.length > 0);
        const badgeOrder = executedSelf ? order : (groupExecutedOrders && groupExecutedOrders[0]);
        const dimmed = hasTrace && !executed;
        const isSelected = box.nodeId && box.nodeId === selectedNodeId;
        const isFault = Boolean(opts.forceFault || (faultNodeId && box.nodeId === faultNodeId));
        const isEndedHere = Boolean(opts.forceEnded || (endedAtNodeId && box.nodeId === endedAtNodeId));

        const testId = `flow-node-${box.nodeId}`;

        const cardBody = (
            <g
                data-testid={testId}
                tabIndex={0}
                role='img'
                aria-label={tooltipTitle}
                style={{
                    cursor: onNodeClick ? 'pointer' : 'default', opacity: dimmed ? 0.35 : 1, outline: 'none',
                }}
                onClick={() => {
                    if (opts.stacked && opts.groupId) {
                        toggleGroup(opts.groupId);
                        return;
                    }
                    if (onNodeClick) onNodeClick(node);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (opts.stacked && opts.groupId) {
                            toggleGroup(opts.groupId);
                        } else if (onNodeClick) {
                            onNodeClick(node);
                        }
                    }
                }}
            >
                {opts.stacked && (
                    <>
                        <rect
                            x={box.x + 6} y={box.y + 6} width={box.width} height={box.height}
                            rx={10} fill={theme.palette.background.paper}
                            stroke={theme.palette.divider} strokeWidth={1}
                        />
                        <rect
                            x={box.x + 3} y={box.y + 3} width={box.width} height={box.height}
                            rx={10} fill={theme.palette.background.paper}
                            stroke={theme.palette.divider} strokeWidth={1}
                        />
                    </>
                )}
                <rect
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    rx={10}
                    fill={theme.palette.background.paper}
                    stroke={isFault ? theme.palette.error.main : (isSelected ? theme.palette.primary.main : theme.palette.divider)}
                    strokeWidth={isFault || isSelected ? 2 : 1}
                    style={{ filter: `drop-shadow(0 1px 2px ${alpha('#0f172a', mode === 'dark' ? 0.4 : 0.12)})` }}
                />
                <rect x={box.x} y={box.y} width={4} height={box.height} rx={2} fill={accent} />
                {/* icon in a tinted circle */}
                <circle cx={box.x + 26} cy={box.y + box.height / 2} r={15} fill={alpha(accent, mode === 'dark' ? 0.22 : 0.12)} />
                <g transform={`translate(${box.x + 26 - 9}, ${box.y + box.height / 2 - 9})`}>
                    {opts.stacked ? (
                        <LayersOutlined width={18} height={18} htmlColor={accent} />
                    ) : (
                        <Icon width={18} height={18} htmlColor={accent} />
                    )}
                </g>
                <text
                    x={box.x + 48}
                    y={box.y + 22}
                    fontSize={13}
                    fontWeight={600}
                    fill={theme.palette.text.primary}
                >
                    {opts.stacked ? `Properties × ${opts.groupSize}` : catalogEntry.label}
                </text>
                <text
                    x={box.x + 48}
                    y={box.y + 38}
                    fontSize={11.5}
                    fontWeight={400}
                    fontFamily={MONO_FONT_FAMILY}
                    fill={theme.palette.text.secondary}
                >
                    {opts.stacked
                        ? intl.formatMessage({
                            id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.group.clickToExpand',
                            defaultMessage: 'Click to expand',
                        })
                        : renderSummaryTspans(
                            fullSummary.length > 32 ? `${fullSummary.slice(0, 32)}…` : fullSummary,
                            theme.palette.text.secondary,
                            accent,
                        )}
                </text>
                {chips.length > 0 && !opts.stacked && renderChips(box.x + 48, box.y + 44, chips, accent)}
                {/* Item 6: nodeId badge as a small circle straddling the card's top-right corner,
                    with a "ring" (a stroke in the card's own fill color) so it reads as
                    intentional rather than colliding with the border - replaced by the
                    execution-order circle (same spot) once a trace exists. */}
                {!executed && !opts.stacked && (
                    <>
                        <circle
                            cx={box.x + box.width - 4}
                            cy={box.y + 4}
                            r={10}
                            fill={theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200]}
                            stroke={theme.palette.background.paper}
                            strokeWidth={2}
                        />
                        <text
                            x={box.x + box.width - 4}
                            y={box.y + 7.5}
                            textAnchor='middle'
                            fontSize={9}
                            fill={theme.palette.text.secondary}
                        >
                            {box.nodeId}
                        </text>
                    </>
                )}
                {executed && (
                    <>
                        <circle
                            data-testid={`flow-node-${box.nodeId}-executed`}
                            cx={box.x + box.width - 4}
                            cy={box.y + 4}
                            r={10}
                            fill={isFault ? theme.palette.error.main : theme.palette.success.main}
                            stroke={theme.palette.background.paper}
                            strokeWidth={2}
                        />
                        <text
                            x={box.x + box.width - 4}
                            y={box.y + 7.5}
                            textAnchor='middle'
                            fontSize={10}
                            fill={theme.palette.common.white}
                        >
                            {badgeOrder}
                        </text>
                    </>
                )}
                {isFault && (
                    // Item 6: inline next to the title (reserved space to its right), not below
                    // the card - a below-card chip could clip against the next row / branch lane.
                    <g transform={`translate(${box.x + box.width - 90}, ${box.y + 6})`}>
                        <rect width={58} height={16} rx={8} fill={alpha(theme.palette.error.main, 0.15)} />
                        <ErrorOutlineRounded width={11} height={11} htmlColor={theme.palette.error.main} x={5} y={2.5} />
                        <text x={32} y={11.5} textAnchor='middle' fontSize={9} fontWeight={700} fill={theme.palette.error.main}>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.fault'
                                defaultMessage='Fault'
                            />
                        </text>
                    </g>
                )}
                {isEndedHere && !isFault && (
                    <g transform={`translate(${box.x + box.width / 2 - 46}, ${box.y + box.height + 4})`}>
                        <rect width={92} height={16} rx={8} fill={alpha(theme.palette.info.main, 0.15)} />
                        <text x={46} y={11.5} textAnchor='middle' fontSize={9} fontWeight={700} fill={theme.palette.info.main}>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.ended.here'
                                defaultMessage='Ended here'
                            />
                        </text>
                    </g>
                )}
            </g>
        );

        return (
            <Tooltip key={box.id} title={tooltipTitle} placement='top' arrow enterDelay={300}>
                {cardBody}
            </Tooltip>
        );
    };

    const renderBox = (box: LayoutBox) => {
        if (box.kind === 'lane') {
            const tint = branchTint(box.branchKey, mode);
            const color = mode === 'dark' ? tint.dark : tint.light;
            // Item 4 (UX polish): lighter tint, subtler 1px/40%-alpha dashed border, so lanes read
            // as a soft grouping rather than competing with the node cards for attention.
            return (
                <rect
                    key={box.id}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    rx={14}
                    fill={alpha(color, mode === 'dark' ? 0.045 : 0.03)}
                    stroke={alpha(color, 0.4)}
                    strokeWidth={1}
                    strokeDasharray='3 3'
                />
            );
        }

        if (box.kind === 'emptyBranch') {
            // Item 4: a small, centered "empty branch" placeholder instead of a blank sliver, so
            // an empty else/default/target branch still reads as intentional.
            return (
                <text
                    key={box.id}
                    x={box.x + box.width / 2}
                    y={box.y + box.height / 2 + 4}
                    textAnchor='middle'
                    fontSize={11}
                    fontStyle='italic'
                    fill={theme.palette.text.disabled}
                    data-testid='flow-diagram-empty-branch'
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.emptyBranch'
                        defaultMessage='empty branch'
                    />
                </text>
            );
        }

        if (box.kind === 'branchLabel') {
            const tint = branchTint(box.branchKey, mode);
            const color = mode === 'dark' ? tint.dark : tint.light;
            const pill = mode === 'dark' ? tint.pillDark : tint.pillLight;
            const pillWidth = Math.min(box.width - 8, 18 + (box.label?.length || 0) * 6.4);
            return (
                <g key={box.id}>
                    <rect
                        x={box.x + (box.width - pillWidth) / 2}
                        y={box.y + 2}
                        width={pillWidth}
                        height={20}
                        rx={10}
                        fill={pill}
                    />
                    <text
                        x={box.x + box.width / 2}
                        y={box.y + 16}
                        textAnchor='middle'
                        fontSize={11}
                        fontWeight={600}
                        fill={color}
                    >
                        {box.label}
                    </text>
                </g>
            );
        }

        if (box.kind === 'groupHeader') {
            const expanded = Boolean(box.groupId && expandedGroupIds.has(box.groupId));
            return (
                <g
                    key={box.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => box.groupId && toggleGroup(box.groupId)}
                    data-testid={`flow-group-header-${box.groupId}`}
                >
                    <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={8} fill={theme.palette.action.hover} />
                    <g transform={`translate(${box.x + 8}, ${box.y + 6})`}>
                        <AutoAwesomeMosaicOutlined width={16} height={16} htmlColor={theme.palette.text.secondary} />
                    </g>
                    <text x={box.x + 30} y={box.y + 18} fontSize={11} fontWeight={600} fill={theme.palette.text.secondary}>
                        {box.label}
                    </text>
                    <text x={box.x + box.width - 10} y={box.y + 18} textAnchor='end' fontSize={10} fill={theme.palette.primary.main}>
                        {expanded
                            ? intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.group.collapse',
                                defaultMessage: 'Collapse',
                            })
                            : ''}
                    </text>
                </g>
            );
        }

        if (box.kind === 'group' && box.groupMembers) {
            const orders = box.groupMembers
                .map((m) => traceByNodeId.get(m.nodeId))
                .filter((o): o is number => o !== undefined)
                .sort((a, b) => a - b);
            const groupHasFault = Boolean(faultNodeId) && box.groupMembers.some((m) => m.nodeId === faultNodeId);
            const groupHasEnded = Boolean(endedAtNodeId) && box.groupMembers.some((m) => m.nodeId === endedAtNodeId);
            const representative = box.groupMembers[0];
            return renderNodeCard(box, representative, {
                stacked: true,
                groupSize: box.groupMembers.length,
                groupId: box.groupId,
                groupOrders: orders,
                forceFault: groupHasFault,
                forceEnded: groupHasEnded,
            });
        }

        if (box.kind === 'start' || box.kind === 'end') {
            const isStart = box.kind === 'start';
            const width = 88;
            const cx = box.x + box.width / 2;
            return (
                <g key={box.id}>
                    <rect
                        x={cx - width / 2}
                        y={box.y}
                        width={width}
                        height={box.height}
                        rx={box.height / 2}
                        fill={theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[200]}
                        stroke={theme.palette.divider}
                    />
                    <g transform={`translate(${cx - width / 2 + 12}, ${box.y + box.height / 2 - 8})`}>
                        {isStart
                            ? <PlayArrowRounded width={16} height={16} htmlColor={theme.palette.text.secondary} />
                            : <OutlinedFlagRounded width={16} height={16} htmlColor={theme.palette.text.secondary} />}
                    </g>
                    <text
                        x={cx + 8}
                        y={box.y + box.height / 2 + 4}
                        textAnchor='middle'
                        fontSize={12}
                        fontWeight={600}
                        fill={theme.palette.text.primary}
                    >
                        {box.label}
                    </text>
                </g>
            );
        }

        if (!box.node) {
            return null;
        }
        return renderNodeCard(box, box.node);
    };

    const showEmptyState = nodes.length === 0 && !staleBanner;

    return (
        <Box
            ref={containerRef}
            sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                bgcolor: theme.palette.mode === 'dark' ? '#0b1220' : '#f8fafc',
                backgroundImage: `radial-gradient(${theme.palette.divider} 1px, transparent 1px)`,
                backgroundSize: '18px 18px',
            }}
        >
            {staleBanner && (
                <Box sx={{
                    position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2,
                }}
                >
                    <Paper elevation={2} sx={{
                        px: 1.5, py: 0.75, bgcolor: 'warning.light', color: 'warning.contrastText',
                    }}
                    >
                        <Typography variant='caption' data-testid='flow-diagram-stale-banner'>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.staleBanner'
                                defaultMessage='Showing last valid diagram — fix errors at line {line}'
                                values={{ line: staleBanner.line }}
                            />
                        </Typography>
                    </Paper>
                </Box>
            )}

            {hasTrace && (
                <Paper
                    elevation={1}
                    sx={{
                        position: 'absolute', top: staleBanner ? 44 : 8, left: 8, zIndex: 2, p: 1, display: 'flex', gap: 1.5, alignItems: 'center',
                    }}
                    data-testid='flow-diagram-legend'
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{
                            width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main',
                        }}
                        />
                        <Typography variant='caption'>
                            <FormattedMessage id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.legend.executed' defaultMessage='Executed' />
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{
                            width: 10, height: 10, borderRadius: '50%', bgcolor: 'action.disabledBackground', opacity: 0.6,
                        }}
                        />
                        <Typography variant='caption'>
                            <FormattedMessage id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.legend.notExecuted' defaultMessage='Not executed' />
                        </Typography>
                    </Box>
                    {faultNodeId && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{
                                width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main',
                            }}
                            />
                            <Typography variant='caption'>
                                <FormattedMessage id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.legend.fault' defaultMessage='Fault' />
                            </Typography>
                        </Box>
                    )}
                </Paper>
            )}

            {showEmptyState && (
                <Box sx={{
                    position: 'absolute',
                    // Item 5 (UX polish): centered in the canvas area ABOVE the zoom toolbar
                    // (reserved via `bottom`), instead of a fixed percentage top-padding that
                    // could push the caption down into the toolbar on a shorter canvas.
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 64,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    color: 'text.secondary',
                    px: 4,
                    textAlign: 'center',
                    zIndex: 1,
                }}
                data-testid='flow-diagram-empty-state'
                >
                    <AutoAwesomeMosaicOutlined sx={{ width: 40, height: 40, opacity: 0.4 }} />
                    <Typography variant='body2'>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.empty'
                            defaultMessage='Add mediators from the palette or pick a template'
                        />
                    </Typography>
                </Box>
            )}

            <svg
                ref={svgRef}
                width='100%'
                height='100%'
                role='img'
                aria-label='Policy flow diagram'
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: dragState.current ? 'grabbing' : 'grab', fontFamily: theme.typography.fontFamily }}
            >
                {/* Item 5: the empty state shows only its own card - no Start/End pills or the
                    connector between them competing for attention behind it. */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ display: showEmptyState ? 'none' : undefined }}>
                    {layout.edges.map((edge) => {
                        const from = layout.boxes.find((b) => b.id === edge.fromId);
                        const to = layout.boxes.find((b) => b.id === edge.toId);
                        if (!from || !to) return null;
                        const fromExecuted = hasTrace && traceByNodeId.has(from.nodeId);
                        const toExecuted = hasTrace && traceByNodeId.has(to.nodeId);
                        const edgeExecuted = fromExecuted && toExecuted;
                        const x1 = from.x + from.width / 2;
                        const y1 = from.y + from.height;
                        const x2 = to.x + to.width / 2;
                        const y2 = to.y;
                        return (
                            <path
                                key={edge.id}
                                d={elbowPath(x1, y1, x2, y2)}
                                fill='none'
                                stroke={edgeExecuted ? theme.palette.success.main : theme.palette.divider}
                                strokeWidth={edgeExecuted ? 2.5 : 1.5}
                                opacity={hasTrace && !edgeExecuted ? 0.35 : 1}
                                markerEnd={edgeExecuted ? 'url(#apim-editor-arrow-executed)' : 'url(#apim-editor-arrow)'}
                            />
                        );
                    })}
                    {layout.boxes.map(renderBox)}
                </g>
                <defs>
                    <marker id='apim-editor-arrow' markerWidth={8} markerHeight={8} refX={6} refY={4} orient='auto'>
                        <path d='M0,0 L8,4 L0,8 Z' fill={theme.palette.divider} />
                    </marker>
                    <marker id='apim-editor-arrow-executed' markerWidth={8} markerHeight={8} refX={6} refY={4} orient='auto'>
                        <path d='M0,0 L8,4 L0,8 Z' fill={theme.palette.success.main} />
                    </marker>
                </defs>
            </svg>

            <Paper
                elevation={2}
                sx={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 5,
                    px: 0.5,
                }}
                data-testid='flow-diagram-zoom-toolbar'
            >
                <Tooltip title={intl.formatMessage({ id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.zoomOut', defaultMessage: 'Zoom out' })}>
                    <IconButton size='small' onClick={() => setScale((s) => clampScale(s - 0.1))}>
                        <ZoomOutIcon fontSize='small' />
                    </IconButton>
                </Tooltip>
                <Typography variant='caption' sx={{ minWidth: 40, textAlign: 'center' }} data-testid='flow-diagram-zoom-level'>
                    {Math.round(scale * 100)}
                    %
                </Typography>
                <Tooltip title={intl.formatMessage({ id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.zoomIn', defaultMessage: 'Zoom in' })}>
                    <IconButton size='small' onClick={() => setScale((s) => clampScale(s + 0.1))}>
                        <ZoomInIcon fontSize='small' />
                    </IconButton>
                </Tooltip>
                <Divider orientation='vertical' flexItem sx={{ mx: 0.25, my: 0.75 }} />
                <Tooltip title={intl.formatMessage({ id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.fitToView', defaultMessage: 'Fit to view' })}>
                    <IconButton size='small' onClick={fitToView} data-testid='flow-diagram-fit-btn'>
                        <FitScreenIcon fontSize='small' />
                    </IconButton>
                </Tooltip>
                <Tooltip title={intl.formatMessage({ id: 'Apis.Details.Policies.PolicyForm.Editor.FlowDiagram.resetView', defaultMessage: 'Reset view' })}>
                    <IconButton size='small' onClick={() => { setScale(1); setPan({ x: 24, y: 24 }); }}>
                        <RestartAltIcon fontSize='small' />
                    </IconButton>
                </Tooltip>
            </Paper>
        </Box>
    );
};

export default FlowDiagram;
