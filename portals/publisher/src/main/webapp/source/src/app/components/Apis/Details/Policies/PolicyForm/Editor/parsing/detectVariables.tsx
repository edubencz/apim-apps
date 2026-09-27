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

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

// Jinja/Jinjava keywords and literals that are never variable names.
const KEYWORDS = new Set([
    'if', 'elif', 'else', 'endif', 'for', 'endfor', 'in', 'not', 'and', 'or', 'is',
    'true', 'false', 'none', 'null', 'set', 'endset', 'block', 'endblock',
    'macro', 'endmacro', 'call', 'endcall', 'filter', 'endfilter', 'with', 'endwith',
    'loop', 'recursive', 'include', 'import', 'as', 'raw', 'endraw',
]);

/**
 * Extracts the base identifier(s) referenced by a jinja expression, e.g. `user.name` -> `user`,
 * `price | currency` -> `price`, `a + b` -> `a`, `b`. Property/index access (`.field`, `[0]`) is
 * dropped since only the top-level variable is a candidate policy attribute.
 * @param {string} expression Raw jinja expression text (without the surrounding delimiters)
 * @param {Set<string>} exclude Identifiers to exclude (e.g. declared loop variables, keywords)
 * @returns {string[]} Base identifiers referenced by the expression
 */
function extractBaseIdentifiers(expression: string, exclude: Set<string>): string[] {
    const found: string[] = [];
    // Strip filters (`| filterName(...)`) - filter names are not variables.
    const withoutFilters = expression.split('|')[0];
    const matches = withoutFilters.match(IDENTIFIER) || [];
    let previousEnd = -1;
    let cursor = 0;
    for (const token of matches) {
        const idx = withoutFilters.indexOf(token, cursor);
        cursor = idx + token.length;
        const precedingChar = idx > 0 ? withoutFilters[idx - 1] : '';
        if (precedingChar === '.') {
            // Property access - not a base identifier.
            previousEnd = cursor;
            continue;
        }
        if (KEYWORDS.has(token) || exclude.has(token)) {
            previousEnd = cursor;
            continue;
        }
        found.push(token);
        previousEnd = cursor;
    }
    void previousEnd;
    return found;
}

/**
 * Parses a `{% for ... in ... %}` tag into its declared loop variables (excluded from the
 * result) and the identifiers of the collection expression being iterated (included).
 * @param {string} tagBody Statement body without `{%`/`%}` and without the leading `for` keyword
 * @returns {string[]} Identifiers referenced by the iterated collection expression
 */
function extractForLoopVariables(tagBody: string): string[] {
    const inIndex = tagBody.search(/\bin\b/);
    if (inIndex === -1) {
        return [];
    }
    const loopVarsPart = tagBody.slice(0, inIndex);
    const collectionPart = tagBody.slice(inIndex + 2);
    const loopVars = new Set((loopVarsPart.match(IDENTIFIER) || []).filter((t) => !KEYWORDS.has(t)));
    return extractBaseIdentifiers(collectionPart, loopVars);
}

/**
 * Detects the variable identifiers referenced by a `.j2` policy body: expressions (`{{ var }}`,
 * `{{ var | filter }}`) and statement conditions/collections (`{% if var %}`,
 * `{% for x in var %}` - loop variables like `x` are excluded from the result since they are
 * locally bound, not policy attributes).
 * @param {string} source Raw `.j2` policy source text
 * @returns {string[]} Sorted, de-duplicated list of referenced variable names
 */
export function detectVariables(source: string): string[] {
    const variables = new Set<string>();
    const statementPattern = /\{%([\s\S]*?)%\}/g;

    // First pass: collect every `{% for x in ... %}` loop variable declared anywhere in the
    // document, so references to it inside the loop body (e.g. `{{ x }}`) are not mistaken for
    // policy attributes, regardless of which pass encounters them first.
    const loopVarNames = new Set<string>();
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = statementPattern.exec(source)) !== null) {
        const body = match[1].trim();
        if (/^for\b/.test(body)) {
            const inIndex = body.search(/\bin\b/);
            if (inIndex !== -1) {
                const loopVarsPart = body.slice(3, inIndex);
                (loopVarsPart.match(IDENTIFIER) || [])
                    .filter((t) => !KEYWORDS.has(t))
                    .forEach((t) => loopVarNames.add(t));
            }
        }
    }

    const expressionPattern = /\{\{([\s\S]*?)\}\}/g;
    // eslint-disable-next-line no-cond-assign
    while ((match = expressionPattern.exec(source)) !== null) {
        extractBaseIdentifiers(match[1], loopVarNames).forEach((id) => variables.add(id));
    }

    statementPattern.lastIndex = 0;
    // eslint-disable-next-line no-cond-assign
    while ((match = statementPattern.exec(source)) !== null) {
        const body = match[1].trim();
        if (/^for\b/.test(body)) {
            extractForLoopVariables(body.replace(/^for\s*/, '')).forEach((id) => variables.add(id));
        } else if (/^(if|elif)\b/.test(body)) {
            extractBaseIdentifiers(body.replace(/^(if|elif)\s*/, ''), loopVarNames).forEach(
                (id) => variables.add(id),
            );
        }
        // Other statement kinds (set/include/block/...) are not treated as attribute references.
    }

    return Array.from(variables).sort();
}

export default detectVariables;
