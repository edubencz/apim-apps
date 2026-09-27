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

import { summarizeMediator } from '../diagram/mediatorCatalog';
import { detectVariables } from './detectVariables';
import { j2Mask } from './j2Mask';
import { buildRawInfo } from './rawElementInfo';
import type { FlowBranch, FlowNode, ParseError, ParseResult } from '../types';
import type { RawElementInfo } from './rawElementInfo';

const SYNTHETIC_ROOT_TAG = 'apim-editor-synthetic-root';
const SYNAPSE_NS = 'http://ws.apache.org/ns/synapse';

interface TagEvent {
    name: string;
    line: number;
    column: number;
    selfClosing: boolean;
    /** Absolute character offset of this tag's opening `<` in the (masked, same-length-as-
     * original) scanned text. Item 2 (UX polish): used to slice the ORIGINAL, unmasked source so
     * summaries never leak `j2Mask`'s `x` placeholders for `{{ }}`/`{% %}` values. */
    startOffset: number;
    /** Absolute character offset of this opening tag's closing `>`. */
    tagEndOffset: number;
    /** For a non-self-closing tag, the offset of the matching closing tag's `<`, once found -
     * lets callers slice out this element's raw inner text/markup. Undefined for self-closing
     * tags and, defensively, for any tag whose close was never matched (a well-formedness error,
     * in which case `parseSynapseXml` never gets this far anyway). */
    closeStartOffset?: number;
}

/**
 * A small, dependency-free well-formedness scanner over the (already j2-masked) policy text.
 * It exists for two reasons:
 *  1. `DOMParser`'s `parsererror` output format/line numbers differ across browsers and are not
 *     implemented consistently (or at all) under jsdom, so error line numbers can't be relied on.
 *  2. It doubles as the source of every open tag's line/column, in the exact document order the
 *     corresponding DOM elements will appear in - see `parseSynapseXml` for how the two are zipped.
 * @param {string} text Masked `.j2` policy source
 * @returns {{events: TagEvent[], errors: ParseError[]}} Open-tag events in document order, and any
 * mismatched/unclosed tag errors found
 */
function scanTags(text: string): { events: TagEvent[]; errors: ParseError[] } {
    const events: TagEvent[] = [];
    const errors: ParseError[] = [];
    const stack: { name: string; line: number; column: number; eventIndex: number }[] = [];
    let line = 1;
    let column = 1;
    let i = 0;
    const len = text.length;

    const advance = (ch: string) => {
        if (ch === '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    };

    while (i < len) {
        const ch = text[i];
        if (ch !== '<') {
            advance(ch);
            i += 1;
            continue;
        }

        const startLine = line;
        const startColumn = column;
        const startOffset = i;

        if (text.startsWith('<!--', i)) {
            const end = text.indexOf('-->', i + 4);
            const stop = end === -1 ? len : end + 3;
            for (let j = i; j < stop; j++) advance(text[j]);
            i = stop;
            continue;
        }
        if (text.startsWith('<![CDATA[', i)) {
            const end = text.indexOf(']]>', i + 9);
            const stop = end === -1 ? len : end + 3;
            for (let j = i; j < stop; j++) advance(text[j]);
            i = stop;
            continue;
        }
        if (text.startsWith('<?', i)) {
            const end = text.indexOf('?>', i + 2);
            const stop = end === -1 ? len : end + 2;
            for (let j = i; j < stop; j++) advance(text[j]);
            i = stop;
            continue;
        }
        if (text.startsWith('<!', i)) {
            const end = text.indexOf('>', i + 2);
            const stop = end === -1 ? len : end + 1;
            for (let j = i; j < stop; j++) advance(text[j]);
            i = stop;
            continue;
        }

        // Opening or closing tag.
        let j = i + 1;
        let isClosing = false;
        if (text[j] === '/') {
            isClosing = true;
            j += 1;
        }
        const nameStart = j;
        while (j < len && /[^\s/>]/.test(text[j])) {
            j += 1;
        }
        const name = text.slice(nameStart, j);

        let inQuote: string | null = null;
        let k = j;
        while (k < len) {
            const c = text[k];
            if (inQuote) {
                if (c === inQuote) inQuote = null;
            } else if (c === '"' || c === '\'') {
                inQuote = c;
            } else if (c === '>') {
                break;
            }
            k += 1;
        }
        const tagEnd = k < len ? k : len - 1;
        const selfClosing = !isClosing && tagEnd > 0 && text[tagEnd - 1] === '/';

        for (let p = i; p <= tagEnd && p < len; p++) advance(text[p]);
        i = tagEnd + 1;

        if (!name) {
            continue;
        }

        if (isClosing) {
            const top = stack[stack.length - 1];
            if (!top) {
                errors.push({
                    line: startLine,
                    column: startColumn,
                    message: `Unexpected closing tag </${name}> with no matching open tag`,
                });
            } else if (top.name !== name) {
                errors.push({
                    line: startLine,
                    column: startColumn,
                    message: `Mismatched closing tag </${name}>, expected </${top.name}> ` +
                        `(opened at line ${top.line})`,
                });
                stack.pop();
            } else {
                events[top.eventIndex].closeStartOffset = startOffset;
                stack.pop();
            }
        } else {
            events.push({
                name, line: startLine, column: startColumn, selfClosing, startOffset, tagEndOffset: tagEnd,
            });
            if (!selfClosing) {
                stack.push({
                    name, line: startLine, column: startColumn, eventIndex: events.length - 1,
                });
            }
        }
    }

    stack.forEach((unclosed) => {
        errors.push({
            line: unclosed.line,
            column: unclosed.column,
            message: `Unclosed tag <${unclosed.name}>`,
        });
    });

    return { events, errors };
}

function localName(el: Element): string {
    return el.tagName.includes(':') ? (el.tagName.split(':').pop() as string) : el.tagName;
}

function findChildByTag(el: Element, tag: string): Element | null {
    return Array.from(el.children).find((c) => localName(c).toLowerCase() === tag) || null;
}

function getChildrenByTag(el: Element, tag: string): Element[] {
    return Array.from(el.children).filter((c) => localName(c).toLowerCase() === tag);
}

/**
 * Returns the flow-mediator children of a container element. When `allowSequenceUnwrap` is set
 * and the container's only child is an inline `<sequence>` (the shape used for `clone`/`iterate`/
 * `foreach` targets), that sequence's own children are returned instead - see `Editor/CONTRACT.md`.
 * @param {Element} el The container element
 * @param {boolean} allowSequenceUnwrap Whether a lone inline `<sequence>` child should be unwrapped
 * @returns {Element[]} The mediator elements to index within this container
 */
function collectContainerElements(el: Element, allowSequenceUnwrap: boolean): Element[] {
    const children = Array.from(el.children);
    if (allowSequenceUnwrap && children.length === 1 && localName(children[0]).toLowerCase() === 'sequence') {
        return Array.from(children[0].children);
    }
    return children;
}

function collectElementsPreOrder(root: Element, out: Element[]): void {
    Array.from(root.children).forEach((child) => {
        out.push(child);
        collectElementsPreOrder(child, out);
    });
}

function attrsOf(el: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    Array.from(el.attributes).forEach((attr) => {
        if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
            return;
        }
        attrs[attr.name] = attr.value;
    });
    return attrs;
}


/**
 * Builds the branches of a container mediator (filter/switch/clone/iterate/foreach/throttle/
 * cache/aggregate/validate), recursing into each branch's own mediator list. Mediators with no
 * branch semantics (property, log, call, ...) return `undefined`. See `Editor/CONTRACT.md`.
 */
function buildBranches(
    el: Element,
    basePath: string,
    positions: Map<Element, { line: number; column: number }>,
    rawInfo: Map<Element, RawElementInfo>,
): FlowBranch[] | undefined {
    const tag = localName(el).toLowerCase();

    const branch = (label: string, key: string, containerEl: Element, allowUnwrap = false): FlowBranch => {
        const path = `${basePath}/${key}`;
        const children = collectContainerElements(containerEl, allowUnwrap);
        return {
            label,
            key,
            nodes: children.map((child, i) => buildNode(child, `${path}/${i}`, positions, rawInfo)),
        };
    };

    switch (tag) {
        case 'filter': {
            const thenEl = findChildByTag(el, 'then');
            const elseEl = findChildByTag(el, 'else');
            if (thenEl || elseEl) {
                const branches: FlowBranch[] = [];
                if (thenEl) branches.push(branch('then', 'then', thenEl));
                if (elseEl) branches.push(branch('else', 'else', elseEl));
                return branches;
            }
            // Filter without <then>/<else>: its direct children are the "true" branch, addressed
            // via the same "then" segment for a single predictable path shape - see CONTRACT.md.
            return [branch('then', 'then', el)];
        }
        case 'switch': {
            const cases = getChildrenByTag(el, 'case');
            const branches = cases.map((caseEl, i) => branch(
                `case: ${caseEl.getAttribute('regex') || i}`,
                `case[${i}]`,
                caseEl,
            ));
            const defaultEl = findChildByTag(el, 'default');
            if (defaultEl) {
                branches.push(branch('default', 'default', defaultEl));
            }
            return branches;
        }
        case 'clone': {
            const targets = getChildrenByTag(el, 'target');
            return targets.map((t, i) => branch(`target ${i + 1}`, `target[${i}]`, t, true));
        }
        case 'iterate':
        case 'foreach': {
            const target = findChildByTag(el, 'target');
            return target ? [branch('target', 'target', target, true)] : undefined;
        }
        case 'throttle': {
            const onAccept = findChildByTag(el, 'onaccept');
            const onReject = findChildByTag(el, 'onreject');
            const branches: FlowBranch[] = [];
            if (onAccept) branches.push(branch('onAccept', 'onAccept', onAccept));
            if (onReject) branches.push(branch('onReject', 'onReject', onReject));
            return branches.length ? branches : undefined;
        }
        case 'cache': {
            const onCacheHit = findChildByTag(el, 'oncachehit');
            return onCacheHit ? [branch('onCacheHit', 'onCacheHit', onCacheHit)] : undefined;
        }
        case 'aggregate': {
            const onComplete = findChildByTag(el, 'oncomplete');
            return onComplete ? [branch('onComplete', 'onComplete', onComplete)] : undefined;
        }
        case 'validate': {
            const onFail = findChildByTag(el, 'on-fail');
            return onFail ? [branch('on-fail', 'on-fail', onFail)] : undefined;
        }
        default:
            return undefined;
    }
}

function buildNode(
    el: Element,
    path: string,
    positions: Map<Element, { line: number; column: number }>,
    rawInfo: Map<Element, RawElementInfo>,
): FlowNode {
    const tag = localName(el);
    // Item 2 (UX polish): use the ORIGINAL (unmasked) attribute values when available, so
    // `{{token_url}}`-style jinja placeholders never leak as `j2Mask`'s `xxxxxxxx` filler into
    // node attrs, chips, tooltips or summaries. Falls back to the masked-DOM attrs for any
    // element the scanner didn't produce raw info for (defensive; shouldn't normally happen).
    const attrs = rawInfo.get(el)?.attrs || attrsOf(el);
    const pos = positions.get(el) || { line: 0, column: 0 };
    return {
        nodeId: path,
        tag,
        attrs,
        line: pos.line,
        column: pos.column,
        summary: summarizeMediator(tag, attrs, el, rawInfo),
        branches: buildBranches(el, path, positions, rawInfo),
    };
}

/**
 * Parses a `.j2` Synapse operation policy body into a flow-node tree following the nodeId
 * contract in `Editor/CONTRACT.md`. Handles both the "user" shape (single `<sequence>` root,
 * unwrapped) and the "mediators-only" shape (multiple top-level mediators, wrapped in a
 * synthetic root purely for `DOMParser`), producing identical nodeIds for equivalent content.
 * @param {string} source Raw `.j2` policy source text (may contain `{{ }}`/`{% %}`/`{# #}`)
 * @returns {ParseResult} The parsed flow, any errors (with line/column), whether the root
 * `<sequence>` was unwrapped, and the variables referenced via jinja constructs
 */
export function parseSynapseXml(source: string): ParseResult {
    const detectedVariables = detectVariables(source);
    const masked = j2Mask(source);
    const { events, errors: wellFormednessErrors } = scanTags(masked);

    if (wellFormednessErrors.length > 0) {
        return { nodes: [], errors: wellFormednessErrors, hasSequenceRoot: false, detectedVariables };
    }

    if (events.length === 0) {
        return { nodes: [], errors: [], hasSequenceRoot: false, detectedVariables };
    }

    const wrapped = `<${SYNTHETIC_ROOT_TAG} xmlns="${SYNAPSE_NS}">${masked}</${SYNTHETIC_ROOT_TAG}>`;

    let doc: Document;
    try {
        const parser = new DOMParser();
        doc = parser.parseFromString(wrapped, 'text/xml');
    } catch (e) {
        return {
            nodes: [],
            errors: [{ line: 1, column: 1, message: 'Failed to parse XML' }],
            hasSequenceRoot: false,
            detectedVariables,
        };
    }

    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
        const message = (parserError.textContent || 'XML parse error').trim().split('\n')[0];
        return {
            nodes: [],
            errors: [{ line: 1, column: 1, message }],
            hasSequenceRoot: false,
            detectedVariables,
        };
    }

    const root = doc.documentElement;
    if (!root) {
        return {
            nodes: [],
            errors: [{ line: 1, column: 1, message: 'Empty document' }],
            hasSequenceRoot: false,
            detectedVariables,
        };
    }

    const domOrder: Element[] = [];
    collectElementsPreOrder(root, domOrder);

    const positions = new Map<Element, { line: number; column: number }>();
    domOrder.forEach((el, idx) => {
        const event = events[idx];
        if (event) {
            positions.set(el, { line: event.line, column: event.column });
        }
    });
    const rawInfo = buildRawInfo(domOrder, events, source);

    const rootChildren = Array.from(root.children);
    let hasSequenceRoot = false;
    let topLevelContainer: Element = root;
    if (rootChildren.length === 1 && localName(rootChildren[0]).toLowerCase() === 'sequence') {
        hasSequenceRoot = true;
        [topLevelContainer] = rootChildren;
    }

    const topLevelElements = Array.from(topLevelContainer.children);
    const nodes = topLevelElements.map((el, i) => buildNode(el, String(i), positions, rawInfo));

    return { nodes, errors: [], hasSequenceRoot, detectedVariables };
}

export default parseSynapseXml;
