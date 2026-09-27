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
import { unwrapSequenceRoot } from '../utils/unwrapSequenceRoot';
import { parseSynapseXml } from '../parsing/parseSynapseXml';

const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__');
function readFixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('unwrapSequenceRoot', () => {
    it('removes the <sequence> wrapper and keeps the same nodeId map', () => {
        const original = readFixture('lean-auth-policy.xml');
        const unwrapped = unwrapSequenceRoot(original);
        expect(unwrapped).not.toContain('<sequence');
        expect(unwrapped).not.toContain('lean-auth-policy');

        const before = parseSynapseXml(original);
        const after = parseSynapseXml(unwrapped);
        expect(after.hasSequenceRoot).toBe(false);
        expect(before.nodes.map((n) => n.nodeId)).toEqual(after.nodes.map((n) => n.nodeId));
        expect(before.nodes.map((n) => n.tag)).toEqual(after.nodes.map((n) => n.tag));
    });

    it('returns the input unchanged when there is no single <sequence> root', () => {
        const source = '<property name="a" value="b"/>\n<log/>\n';
        expect(unwrapSequenceRoot(source)).toBe(source);
    });
});
