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

/**
 * Jinja2 (`.j2`) delimiters that `j2Mask` blanks out before the content is handed to `DOMParser`.
 * Order matters: `{{ }}` (expressions) are masked first, then `{% %}` (statements),
 * then `{# #}` (comments), each with a non-greedy match so nested-looking content within one
 * kind of block does not swallow a following, unrelated block.
 */
const DELIMITER_PATTERNS: RegExp[] = [
    /\{\{[\s\S]*?\}\}/g,
    /\{%[\s\S]*?%\}/g,
    /\{#[\s\S]*?#\}/g,
];

/**
 * Replaces every character of a matched jinja block with `x`, except newlines which are kept
 * as-is so that line numbers of everything after the block are unaffected. This keeps the
 * string exactly the same length and exactly the same line/column layout as the input, so a
 * `DOMParser` (or any other position-aware consumer) can be run against the masked text and its
 * positions can be trusted to match the original `.j2` source.
 * @param {string} match The full delimited jinja block (including its opening/closing markers)
 * @returns {string} A same-length, same-newline-layout placeholder for the block
 */
function blank(match: string): string {
    let result = '';
    for (let i = 0; i < match.length; i++) {
        const ch = match[i];
        result += ch === '\n' || ch === '\r' ? ch : 'x';
    }
    return result;
}

/**
 * Masks jinja2 (`{{ }}`, `{% %}`, `{# #}`) constructs out of a `.j2` Synapse policy body so the
 * remaining text is well-formed-enough XML for `DOMParser` to tokenize, while preserving the
 * exact length, line numbers and column offsets of the original source. This allows parse
 * errors and node positions computed against the masked text to be reported against the
 * original `.j2` source unchanged.
 *
 * Only the delimited block itself is blanked; content between a `{% if %}` and its matching
 * `{% endif %}` (which is ordinary XML/mediator content, not jinja) is left untouched.
 * @param {string} source Raw `.j2` policy source text
 * @returns {string} Same-length text with jinja constructs replaced by `x` placeholders
 */
export function j2Mask(source: string): string {
    let masked = source;
    for (const pattern of DELIMITER_PATTERNS) {
        masked = masked.replace(pattern, blank);
    }
    return masked;
}

export default j2Mask;
