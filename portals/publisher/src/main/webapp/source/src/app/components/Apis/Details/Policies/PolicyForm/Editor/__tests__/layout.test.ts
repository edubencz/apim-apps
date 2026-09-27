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

import fs from 'fs';
import path from 'path';
import { parseSynapseXml } from '../parsing/parseSynapseXml';
import {
    layoutFlow, BOX_WIDTH, computeGroups, GROUP_MIN_SIZE,
} from '../diagram/layout';
import type { FlowNode } from '../types';

const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__');
function readFixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

// Note: uses a non-groupable tag ("send") on purpose - a run of >= GROUP_MIN_SIZE consecutive
// property/header mediators is intentionally collapsed into a single stacked box by default (see
// the "grouping" describe block below), which would change the box count these generic linear
// layout assertions rely on.
function makeLinearNodes(count: number): FlowNode[] {
    return Array.from({ length: count }, (_, i) => ({
        nodeId: String(i), tag: 'send', attrs: {}, line: i + 1, column: 1, summary: '',
    }));
}

function makePropertyNodes(count: number, offset = 0): FlowNode[] {
    return Array.from({ length: count }, (_, i) => ({
        nodeId: String(i + offset), tag: 'property', attrs: { name: `P${i}`, value: 'v' }, line: i + 1, column: 1, summary: `P${i} = v`,
    }));
}

describe('layoutFlow', () => {
    it('lays out a Start terminal, every node and an End terminal for a linear flow', () => {
        const result = layoutFlow(makeLinearNodes(3));
        const kinds = result.boxes.map((b) => b.kind);
        expect(kinds.filter((k) => k === 'start')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'end')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'node')).toHaveLength(3);
        // Start -> node0 -> node1 -> node2 -> End = 4 edges
        expect(result.edges).toHaveLength(4);
    });

    it('increases y monotonically along a linear flow', () => {
        const result = layoutFlow(makeLinearNodes(4));
        const nodeBoxes = result.boxes.filter((b) => b.kind !== 'start' && b.kind !== 'end');
        const ys = nodeBoxes.map((b) => b.y);
        for (let i = 1; i < ys.length; i++) {
            expect(ys[i]).toBeGreaterThan(ys[i - 1]);
        }
    });

    it('produces a canvas at least as wide as two side-by-side branches for a filter', () => {
        const { nodes } = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const result = layoutFlow(nodes);
        expect(result.width).toBeGreaterThanOrEqual(BOX_WIDTH * 2);
        expect(result.height).toBeGreaterThan(0);
    });

    it('creates a branch label box per branch and merges branch exits into a single End edge set', () => {
        const { nodes } = parseSynapseXml(readFixture('switch-example.xml'));
        const result = layoutFlow(nodes);
        const branchLabels = result.boxes.filter((b) => b.kind === 'branchLabel');
        // 2 cases + 1 default = 3 branches
        expect(branchLabels).toHaveLength(3);
        const endBox = result.boxes.find((b) => b.kind === 'end');
        expect(endBox).toBeDefined();
        const edgesIntoEnd = result.edges.filter((e) => e.toId === endBox?.id);
        // one merge edge per branch that has no nested branching (drop mediator produces its own
        // exit, and the switch is the only top-level node with branches)
        expect(edgesIntoEnd.length).toBeGreaterThan(0);
    });

    it('never produces negative x coordinates', () => {
        const { nodes } = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const result = layoutFlow(nodes);
        result.boxes.forEach((box) => {
            expect(box.x).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('computeGroups', () => {
    it('finds no group when there are fewer than GROUP_MIN_SIZE consecutive property/header nodes', () => {
        const groups = computeGroups(makePropertyNodes(GROUP_MIN_SIZE - 1));
        expect(groups).toHaveLength(0);
    });

    it('finds one group spanning every consecutive property/header node', () => {
        const groups = computeGroups(makePropertyNodes(4));
        expect(groups).toHaveLength(1);
        expect(groups[0].nodeIds).toEqual(['0', '1', '2', '3']);
    });

    it('does not bridge a group across a non-groupable mediator in between', () => {
        const nodes: FlowNode[] = [
            ...makePropertyNodes(3, 0),
            { nodeId: '3', tag: 'log', attrs: {}, line: 4, column: 1, summary: '' },
            ...makePropertyNodes(3, 4),
        ];
        const groups = computeGroups(nodes);
        expect(groups).toHaveLength(2);
        expect(groups[0].nodeIds).toEqual(['0', '1', '2']);
        expect(groups[1].nodeIds).toEqual(['4', '5', '6']);
    });

    it('finds groups nested inside branches too', () => {
        const nodes: FlowNode[] = [{
            nodeId: '0',
            tag: 'filter',
            attrs: {},
            line: 1,
            column: 1,
            summary: '',
            branches: [
                { label: 'then', key: 'then', nodes: makePropertyNodes(3, 10) },
                { label: 'else', key: 'else', nodes: [] },
            ],
        }];
        const groups = computeGroups(nodes);
        expect(groups).toHaveLength(1);
        expect(groups[0].nodeIds).toEqual(['10', '11', '12']);
    });
});

describe('layoutFlow grouping/collapsing', () => {
    it('collapses a run of >= GROUP_MIN_SIZE property nodes into a single box by default', () => {
        const result = layoutFlow(makePropertyNodes(4));
        const groupBoxes = result.boxes.filter((b) => b.kind === 'group');
        expect(groupBoxes).toHaveLength(1);
        expect(groupBoxes[0].groupMembers).toHaveLength(4);
        expect(result.boxes.filter((b) => b.kind === 'node')).toHaveLength(0);
    });

    it('expands a group into individual node boxes plus a header when asked to', () => {
        const nodes = makePropertyNodes(4);
        const groups = computeGroups(nodes);
        const result = layoutFlow(nodes, { expandedGroupIds: new Set([groups[0].id]) });
        expect(result.boxes.filter((b) => b.kind === 'group')).toHaveLength(0);
        expect(result.boxes.filter((b) => b.kind === 'groupHeader')).toHaveLength(1);
        expect(result.boxes.filter((b) => b.kind === 'node')).toHaveLength(4);
    });

    it('does not overlap boxes vertically within the same column when a group is expanded', () => {
        const nodes = makePropertyNodes(4);
        const groups = computeGroups(nodes);
        const result = layoutFlow(nodes, { expandedGroupIds: new Set([groups[0].id]) });
        const sorted = [...result.boxes].filter((b) => b.kind !== 'lane').sort((a, b) => a.y - b.y);
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y);
        }
    });

    it('produces lane boxes at least as wide as their branch content for a filter', () => {
        const { nodes } = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const result = layoutFlow(nodes);
        const lanes = result.boxes.filter((b) => b.kind === 'lane');
        expect(lanes.length).toBeGreaterThan(0);
        lanes.forEach((lane) => {
            expect(lane.width).toBeGreaterThanOrEqual(BOX_WIDTH);
        });
    });
});
