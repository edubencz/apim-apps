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
    extractEndpointsFromFlow, extractUrlFromSummary, substituteAttributeValues,
} from '../test/extractEndpoints';

const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__');

function readFixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('extractUrlFromSummary', () => {
    it('strips a leading HTTP method', () => {
        expect(extractUrlFromSummary('POST https://idp.example.com/token')).toBe('https://idp.example.com/token');
    });

    it('returns the summary unchanged when there is no method prefix (address endpoint)', () => {
        expect(extractUrlFromSummary('https://backend.example.com/orders')).toBe('https://backend.example.com/orders');
    });

    it('returns an empty string for an empty summary', () => {
        expect(extractUrlFromSummary('')).toBe('');
    });
});

describe('substituteAttributeValues', () => {
    it('substitutes a known, non-empty attribute value', () => {
        expect(substituteAttributeValues('{{token_url}}/oauth', { token_url: 'https://idp.example.com' }))
            .toBe('https://idp.example.com/oauth');
    });

    it('leaves an unresolved placeholder untouched', () => {
        expect(substituteAttributeValues('{{token_url}}/oauth', {})).toBe('{{token_url}}/oauth');
    });
});

describe('extractEndpointsFromFlow - "Add mock from endpoint" URL extraction', () => {
    it('finds the call/send endpoint URL in the lean-auth-policy fixture', () => {
        const source = readFixture('lean-auth-policy.xml');
        const { nodes } = parseSynapseXml(source);
        const endpoints = extractEndpointsFromFlow(nodes, {});
        expect(endpoints).toHaveLength(1);
        expect(endpoints[0].nodeId).toBe('10');
        expect(endpoints[0].tag.toLowerCase()).toBe('call');
        expect(endpoints[0].resolvedUrl.length).toBeGreaterThan(0);
    });

    it('substitutes a {{attribute}} placeholder in the detected URL when a value is provided', () => {
        const nodes = [
            {
                nodeId: '0', tag: 'call', attrs: {}, line: 1, column: 1, summary: 'POST {{token_url}}',
            },
        ];
        const endpoints = extractEndpointsFromFlow(nodes as any, { token_url: 'https://idp.example.com/token' });
        expect(endpoints[0].rawUrl).toBe('{{token_url}}');
        expect(endpoints[0].resolvedUrl).toBe('https://idp.example.com/token');
    });

    it('walks into branches (then/else/case) to find endpoints nested in a filter/switch', () => {
        const nodes = [
            {
                nodeId: '0',
                tag: 'filter',
                attrs: {},
                line: 1,
                column: 1,
                summary: '',
                branches: [
                    {
                        label: 'then',
                        key: 'then',
                        nodes: [
                            {
                                nodeId: '0/then/0', tag: 'send', attrs: {}, line: 2, column: 1, summary: 'https://a.example.com/x',
                            },
                        ],
                    },
                ],
            },
        ];
        const endpoints = extractEndpointsFromFlow(nodes as any, {});
        expect(endpoints).toHaveLength(1);
        expect(endpoints[0].nodeId).toBe('0/then/0');
        expect(endpoints[0].resolvedUrl).toBe('https://a.example.com/x');
    });

    it('returns an empty list when the flow has no call/send mediators', () => {
        const nodes = [{
            nodeId: '0', tag: 'log', attrs: {}, line: 1, column: 1, summary: 'level=full',
        }];
        expect(extractEndpointsFromFlow(nodes as any, {})).toEqual([]);
    });
});
