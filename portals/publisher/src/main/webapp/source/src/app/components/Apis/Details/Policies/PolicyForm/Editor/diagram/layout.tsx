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

import type { FlowNode } from '../types';

// Issue 4 (UX polish): widened slightly (was 220) so mediator summaries truncate less aggressively
// before falling back to the full-text tooltip in FlowDiagram.tsx.
export const BOX_WIDTH = 260;
export const BOX_HEIGHT = 64;
export const H_GAP = 40;
export const V_GAP = 32;
export const BRANCH_LABEL_HEIGHT = 28;
export const TERMINAL_HEIGHT = 36;
export const LANE_PADDING = 12;
/** Height reserved for an empty branch's "empty branch" placeholder (item 4, UX polish). */
export const EMPTY_BRANCH_HEIGHT = 48;
/** Consecutive "property"-like mediators (property/header) at or above this count auto-collapse. */
export const GROUP_MIN_SIZE = 3;
/** Tag names that are eligible to be grouped into a stacked "Properties xN" card. */
const GROUPABLE_TAGS = new Set(['property', 'header']);

export interface LayoutBox {
    id: string;
    nodeId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    kind: 'start' | 'end' | 'node' | 'branchLabel' | 'lane' | 'group' | 'groupHeader' | 'emptyBranch';
    label?: string;
    node?: FlowNode;
    /** Only for kind 'group': the collapsed member nodes, in order */
    groupMembers?: FlowNode[];
    /** Only for kind 'group'/'groupHeader': stable id derived from the first member's nodeId */
    groupId?: string;
    /** Only for kind 'lane'/'branchLabel': the branch's raw key ("then"/"else"/"case[1]"/"default"),
     * used by FlowDiagram to pick a pill/lane tint without re-parsing the label text. */
    branchKey?: string;
}

export interface LayoutEdge {
    id: string;
    fromId: string;
    toId: string;
    /** Optional label rendered near the edge start, e.g. "then"/"else"/"case: 200" */
    label?: string;
}

export interface LayoutResult {
    boxes: LayoutBox[];
    edges: LayoutEdge[];
    width: number;
    height: number;
}

export interface LayoutOptions {
    /** groupId's (see `computeGroups`) that should be laid out expanded instead of collapsed. */
    expandedGroupIds?: Set<string>;
}

interface SubtreeLayout {
    boxes: LayoutBox[];
    edges: LayoutEdge[];
    width: number;
    height: number;
    /** id of the single entry box at the top of this subtree */
    entryId: string;
    /** ids of every "loose end" box that should connect forward to whatever follows */
    exitIds: string[];
}

let idCounter = 0;
function nextId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

function isGroupable(node: FlowNode): boolean {
    return GROUPABLE_TAGS.has(node.tag.toLowerCase()) && !node.branches;
}

export interface FlowGroup {
    /** Stable id derived from the first member's nodeId, e.g. "group@3" */
    id: string;
    nodeIds: string[];
}

/**
 * Pure scan (no layout, no DOM) for runs of >= `GROUP_MIN_SIZE` consecutive "property"/"header"
 * mediators within the same container (top-level list, or any branch's list), recursively.
 * Layout/rendering decide independently whether a given group starts collapsed or expanded.
 * @param {FlowNode[]} nodes Top-level flow nodes, or a branch's nodes
 * @returns {FlowGroup[]} Every eligible group found, depth-first
 */
export function computeGroups(nodes: FlowNode[]): FlowGroup[] {
    const groups: FlowGroup[] = [];

    function walk(list: FlowNode[]) {
        let run: FlowNode[] = [];
        const flush = () => {
            if (run.length >= GROUP_MIN_SIZE) {
                groups.push({ id: `group@${run[0].nodeId}`, nodeIds: run.map((n) => n.nodeId) });
            }
            run = [];
        };
        list.forEach((node) => {
            if (isGroupable(node)) {
                run.push(node);
            } else {
                flush();
            }
            if (node.branches) {
                node.branches.forEach((branch) => walk(branch.nodes));
            }
        });
        flush();
    }

    walk(nodes);
    return groups;
}

/**
 * Splits a run of sibling nodes into single items and groupable runs (see `computeGroups`), so
 * `layoutRun` can lay each item out either as one node box or, for an unexpanded group, one
 * collapsed "stack" box.
 */
type RunItem = { type: 'single'; node: FlowNode } | { type: 'group'; id: string; members: FlowNode[] };

function splitRunItems(nodes: FlowNode[]): RunItem[] {
    const items: RunItem[] = [];
    let run: FlowNode[] = [];
    const flush = () => {
        if (run.length >= GROUP_MIN_SIZE) {
            items.push({ type: 'group', id: `group@${run[0].nodeId}`, members: run });
        } else {
            run.forEach((node) => items.push({ type: 'single', node }));
        }
        run = [];
    };
    nodes.forEach((node) => {
        if (isGroupable(node)) {
            run.push(node);
        } else {
            flush();
            items.push({ type: 'single', node });
        }
    });
    flush();
    return items;
}

/**
 * Lays out one straight run of sibling flow nodes (a container's mediator list), recursing into
 * any branching mediator (filter/switch/clone/iterate/foreach/throttle/cache/aggregate/validate)
 * to lay out its branches side by side and merge them back into a single exit point. Consecutive
 * property/header runs collapse into a single "group" box unless the caller expanded that group.
 * @param {FlowNode[]} nodes Sibling nodes of a single container (see Editor/CONTRACT.md)
 * @param {number} originX Left edge x offset to lay this run out from
 * @param {number} originY Top y offset to lay this run out from
 * @param {Set<string>} expandedGroupIds Group ids to lay out expanded instead of collapsed
 * @returns {SubtreeLayout} Boxes/edges for this run, its bounding size, and its entry/exit ids
 */
function layoutRun(
    nodes: FlowNode[],
    originX: number,
    originY: number,
    expandedGroupIds: Set<string>,
): SubtreeLayout {
    const boxes: LayoutBox[] = [];
    const edges: LayoutEdge[] = [];

    const items = splitRunItems(nodes);

    if (items.length === 0) {
        // An empty container (e.g. an empty "else" branch) still needs a passthrough point to
        // connect through - rendered as a small centered "empty branch" placeholder (item 4, UX
        // polish) instead of an invisible 1px box, and sized so the lane wrapping it isn't a
        // sliver either.
        const passId = nextId('empty');
        boxes.push({
            id: passId,
            nodeId: '',
            x: originX,
            y: originY,
            width: BOX_WIDTH,
            height: EMPTY_BRANCH_HEIGHT,
            kind: 'emptyBranch',
        });
        return {
            boxes, edges, width: BOX_WIDTH, height: EMPTY_BRANCH_HEIGHT, entryId: passId, exitIds: [passId],
        };
    }

    let currentY = originY;
    let previousExitIds: string[] = [];
    let entryId = '';
    let maxWidth = BOX_WIDTH;

    const connectFrom = (toId: string) => {
        previousExitIds.forEach((exitId) => {
            edges.push({ id: nextId('edge'), fromId: exitId, toId });
        });
        if (!entryId) {
            entryId = toId;
        }
    };

    items.forEach((item) => {
        if (item.type === 'group' && !expandedGroupIds.has(item.id)) {
            const boxId = nextId('group');
            connectFrom(boxId);
            boxes.push({
                id: boxId,
                nodeId: item.members[0].nodeId,
                x: originX,
                y: currentY,
                width: BOX_WIDTH,
                height: BOX_HEIGHT,
                kind: 'group',
                groupId: item.id,
                groupMembers: item.members,
            });
            currentY += BOX_HEIGHT + V_GAP;
            previousExitIds = [boxId];
            return;
        }

        if (item.type === 'group') {
            const headerId = nextId('groupHeader');
            connectFrom(headerId);
            boxes.push({
                id: headerId,
                nodeId: '',
                x: originX,
                y: currentY,
                width: BOX_WIDTH,
                height: BRANCH_LABEL_HEIGHT,
                kind: 'groupHeader',
                groupId: item.id,
                label: `Properties × ${item.members.length}`,
            });
            currentY += BRANCH_LABEL_HEIGHT + V_GAP / 2;
            previousExitIds = [headerId];
            item.members.forEach((node) => {
                const boxId = nextId('box');
                connectFrom(boxId);
                boxes.push({
                    id: boxId, nodeId: node.nodeId, x: originX, y: currentY, width: BOX_WIDTH, height: BOX_HEIGHT, kind: 'node', node, groupId: item.id,
                });
                currentY += BOX_HEIGHT + V_GAP;
                previousExitIds = [boxId];
            });
            return;
        }

        const node = item.node;
        const boxId = nextId('box');
        connectFrom(boxId);
        boxes.push({
            id: boxId, nodeId: node.nodeId, x: originX, y: currentY, width: BOX_WIDTH, height: BOX_HEIGHT, kind: 'node', node,
        });
        currentY += BOX_HEIGHT + V_GAP;
        previousExitIds = [boxId];

        if (node.branches && node.branches.length > 0) {
            const branchLayouts = node.branches.map((br) => {
                const labelId = nextId('label');
                const runLayout = layoutRun(
                    br.nodes,
                    0,
                    currentY + BRANCH_LABEL_HEIGHT + V_GAP / 2,
                    expandedGroupIds,
                );
                return { branch: br, labelId, runLayout };
            });

            const totalBranchWidth = branchLayouts.reduce(
                (sum, b) => sum + b.runLayout.width, 0,
            ) + H_GAP * (branchLayouts.length - 1);
            maxWidth = Math.max(maxWidth, totalBranchWidth);

            let branchX = originX - (totalBranchWidth - BOX_WIDTH) / 2;
            const mergeExitIds: string[] = [];
            let tallest = 0;
            const laneBoxes: LayoutBox[] = [];
            const contentBoxes: LayoutBox[] = [];
            const labelStartY = currentY;

            branchLayouts.forEach(({ branch, labelId, runLayout }) => {
                const shiftedBoxes = runLayout.boxes.map((b) => ({ ...b, x: b.x + branchX }));
                const label: LayoutBox = {
                    id: labelId,
                    nodeId: '',
                    x: branchX,
                    y: labelStartY,
                    width: runLayout.width,
                    height: BRANCH_LABEL_HEIGHT,
                    kind: 'branchLabel',
                    label: branch.label,
                    branchKey: branch.key,
                };
                const laneHeight = BRANCH_LABEL_HEIGHT + V_GAP / 2 + runLayout.height;
                laneBoxes.push({
                    id: nextId('lane'),
                    nodeId: '',
                    x: branchX - LANE_PADDING,
                    y: labelStartY - LANE_PADDING / 2,
                    width: runLayout.width + LANE_PADDING * 2,
                    height: laneHeight + LANE_PADDING,
                    kind: 'lane',
                    branchKey: branch.key,
                });
                contentBoxes.push(label, ...shiftedBoxes);
                edges.push({ id: nextId('edge'), fromId: boxId, toId: runLayout.entryId, label: branch.label });
                edges.push(...runLayout.edges);
                mergeExitIds.push(...runLayout.exitIds);
                tallest = Math.max(tallest, runLayout.height);
                branchX += runLayout.width + H_GAP;
            });
            // Lanes paint first (behind labels/nodes) so the tinted container sits beneath them.
            boxes.push(...laneBoxes, ...contentBoxes);

            currentY += BRANCH_LABEL_HEIGHT + V_GAP / 2 + tallest + V_GAP;
            previousExitIds = mergeExitIds;
        }
    });

    return {
        boxes,
        edges,
        width: maxWidth,
        height: currentY - originY - V_GAP,
        entryId,
        exitIds: previousExitIds,
    };
}

/**
 * Computes a pure (no DOM), vertical series-parallel layout for a parsed flow: a Start terminal,
 * the mediator run, branches laid out side by side with a merge point, and an End terminal.
 * Deterministic given the same input - safe to unit test without a browser.
 * @param {FlowNode[]} nodes Top-level flow nodes, as returned by `parseSynapseXml`
 * @param {LayoutOptions} [options] Optional layout tweaks, e.g. which groups to render expanded
 * @returns {LayoutResult} Positioned boxes and edges, plus the overall canvas size
 */
export function layoutFlow(nodes: FlowNode[], options?: LayoutOptions): LayoutResult {
    idCounter = 0;
    const expandedGroupIds = options?.expandedGroupIds || new Set<string>();
    const boxes: LayoutBox[] = [];
    const edges: LayoutEdge[] = [];

    const startId = nextId('start');
    boxes.push({
        id: startId, nodeId: '', x: 0, y: 0, width: BOX_WIDTH, height: TERMINAL_HEIGHT, kind: 'start', label: 'Start',
    });

    const run = layoutRun(nodes, 0, TERMINAL_HEIGHT + V_GAP, expandedGroupIds);
    boxes.push(...run.boxes);
    edges.push({ id: nextId('edge'), fromId: startId, toId: run.entryId });
    edges.push(...run.edges);

    const endY = TERMINAL_HEIGHT + V_GAP + run.height + V_GAP;
    const endId = nextId('end');
    boxes.push({
        id: endId, nodeId: '', x: 0, y: endY, width: BOX_WIDTH, height: TERMINAL_HEIGHT, kind: 'end', label: 'End',
    });
    run.exitIds.forEach((exitId) => {
        edges.push({ id: nextId('edge'), fromId: exitId, toId: endId });
    });

    // Issue 4 (UX polish): the analytically-tracked `run.width` only accounts for branch content
    // width, not the extra padding lane rects paint beyond it (`LANE_PADDING` on each side), so a
    // fit-to-width computed from it could clip the outermost lane (e.g. the "else" branch) at the
    // right edge. Compute the real bounding box from every box actually painted - including lanes
    // - instead of trusting the analytical width/height.
    const minX = Math.min(...boxes.map((b) => b.x));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const normalizedBoxes = boxes.map((b) => ({ ...b, x: b.x - minX }));
    const width = Math.max(maxX - minX, BOX_WIDTH);
    const height = Math.max(maxY, endY + TERMINAL_HEIGHT);

    return {
        boxes: normalizedBoxes,
        edges,
        width,
        height,
    };
}

export default layoutFlow;
