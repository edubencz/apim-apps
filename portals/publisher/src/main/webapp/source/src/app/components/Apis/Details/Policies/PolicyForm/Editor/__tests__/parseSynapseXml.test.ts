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
import type { FlowNode } from '../types';

const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__');

function readFixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

const expectedNodeIds: Record<string, Record<string, string>> = JSON.parse(
    readFixture('nodeIds.expected.json'),
);

/**
 * Flattens a parsed flow (including branches) into a flat nodeId -> tag map, for comparison
 * against `__fixtures__/nodeIds.expected.json` (shared with the Java-side gateway tests).
 */
function flattenNodeIds(nodes: FlowNode[]): Record<string, string> {
    const out: Record<string, string> = {};
    const visit = (list: FlowNode[]) => {
        list.forEach((node) => {
            out[node.nodeId] = node.tag;
            (node.branches || []).forEach((branch) => visit(branch.nodes));
        });
    };
    visit(nodes);
    return out;
}

describe('parseSynapseXml - nodeId contract fixtures', () => {
    it.each([
        'lean-auth-policy.xml',
        'lean-auth-policy.mediators-only.xml',
        'switch-example.xml',
        'filter-no-then-else.xml',
    ])('matches the expected nodeId -> tag map for %s', (fixtureName) => {
        const source = readFixture(fixtureName);
        const result = parseSynapseXml(source);
        expect(result.errors).toEqual([]);
        expect(flattenNodeIds(result.nodes)).toEqual(expectedNodeIds[fixtureName]);
    });

    it('produces identical nodeIds whether the root <sequence> is present or not', () => {
        const wrapped = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const mediatorsOnly = parseSynapseXml(readFixture('lean-auth-policy.mediators-only.xml'));
        expect(wrapped.hasSequenceRoot).toBe(true);
        expect(mediatorsOnly.hasSequenceRoot).toBe(false);
        expect(flattenNodeIds(wrapped.nodes)).toEqual(flattenNodeIds(mediatorsOnly.nodes));
    });

    it('detects the {{ }} variables used across the sample policy', () => {
        const result = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        expect(result.detectedVariables).toEqual(['password', 'token_url', 'username']);
    });

    it('reports comments as not consuming any nodeId index', () => {
        const result = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        // Comments sit between top-level properties in the fixture; indices must still be
        // contiguous starting at 0.
        const topLevelIds = result.nodes.map((n) => n.nodeId);
        expect(topLevelIds).toEqual(Array.from({ length: 17 }, (_, i) => String(i)));
    });

    it('assigns increasing line numbers to top-level mediators in document order', () => {
        const result = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const lines = result.nodes.map((n) => n.line);
        for (let i = 1; i < lines.length; i++) {
            expect(lines[i]).toBeGreaterThan(lines[i - 1]);
        }
    });

    it('produces switch case[i] and default nodeIds', () => {
        const result = parseSynapseXml(readFixture('switch-example.xml'));
        const switchNode = result.nodes.find((n) => n.tag === 'switch');
        expect(switchNode).toBeDefined();
        const branchKeys = (switchNode?.branches || []).map((b) => b.key);
        expect(branchKeys).toEqual(['case[0]', 'case[1]', 'default']);
    });

    it('treats a filter without then/else as a single "then" branch', () => {
        const result = parseSynapseXml(readFixture('filter-no-then-else.xml'));
        const filterNode = result.nodes.find((n) => n.tag === 'filter');
        expect(filterNode?.branches).toHaveLength(1);
        expect(filterNode?.branches?.[0].key).toBe('then');
        expect(filterNode?.branches?.[0].nodes.map((n) => n.tag)).toEqual(['log', 'respond']);
    });

    it('never leaks j2Mask placeholders into node summaries (item 2, UX polish)', () => {
        // lean-auth-policy.xml's <call> targets `uri-template="{{token_url}}"` and its
        // payloadFactory <format> body embeds `{{username}}`/`{{password}}` - both must show the
        // real jinja expression in the summary, never j2Mask's same-length `xxxxxxxx` filler.
        const result = parseSynapseXml(readFixture('lean-auth-policy.xml'));
        const callNode = result.nodes.find((n) => n.tag === 'call');
        expect(callNode?.summary).toContain('{{token_url}}');
        expect(callNode?.summary).not.toMatch(/x{4,}/);

        const payloadFactoryNode = result.nodes.find((n) => n.tag === 'payloadFactory');
        expect(payloadFactoryNode?.summary).toContain('{{username}}');
        expect(payloadFactoryNode?.summary).toContain('{{password}}');
        expect(payloadFactoryNode?.summary).not.toMatch(/x{4,}/);
    });

    it('reports a line number for a mismatched/unclosed tag', () => {
        const result = parseSynapseXml(readFixture('malformed.xml'));
        expect(result.nodes).toEqual([]);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.line === 5)).toBe(true);
        expect(result.errors[0].message).toMatch(/tag/i);
    });
});
