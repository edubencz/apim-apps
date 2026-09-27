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

const ROOT_SEQUENCE_PATTERN = /^\s*<sequence\b[^>]*>([\s\S]*)<\/sequence>\s*$/;

/**
 * Implements the "Unwrap root `<sequence>`" quick-fix: given a `.j2` body whose whole content is
 * a single `<sequence name="...">...</sequence>` (the "user" shape - see `Editor/CONTRACT.md`),
 * removes the wrapper element (and its `name` attribute along with it) and de-indents the
 * children by one level, leaving the "mediators-only" shape that normalizes to identical
 * nodeIds. Returns the input unchanged if it does not match that single-root shape.
 * @param {string} source Raw `.j2` policy source text
 * @returns {string} The unwrapped body, or the original source if there was nothing to unwrap
 */
export function unwrapSequenceRoot(source: string): string {
    const match = source.match(ROOT_SEQUENCE_PATTERN);
    if (!match) {
        return source;
    }
    const inner = match[1].replace(/\r?\n/g, '\n');
    const lines = inner.split('\n');
    // Drop a single leading tab or up to 4 leading spaces from each line, if present, so the
    // previously-nested children read as top-level content once the wrapper is gone.
    const dedented = lines.map((line) => line.replace(/^(\t| {1,4})/, ''));
    // Trim a single fully-blank leading/trailing line left over from the wrapper's own newlines.
    if (dedented.length > 0 && dedented[0].trim() === '') {
        dedented.shift();
    }
    if (dedented.length > 0 && dedented[dedented.length - 1].trim() === '') {
        dedented.pop();
    }
    return `${dedented.join('\n')}\n`;
}

export default unwrapSequenceRoot;
