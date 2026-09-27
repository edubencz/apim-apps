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
 * Item 2 (UX polish, 2026-09-26): `parseSynapseXml` runs `DOMParser` against a j2-masked copy of
 * the `.j2` source (see `j2Mask.ts`) so `{{ }}`/`{% %}`/`{# #}` jinja constructs never break XML
 * well-formedness. That means every attribute value and text node read straight off that DOM is
 * masked too - a `uri-template="{{token_url}}"` attribute reads back as `uri-template="xxxxxxxxx"`
 * - which used to leak straight into node summaries/chips/tooltips on the flow diagram.
 *
 * Since `j2Mask` preserves the source's exact length and line/column layout, any character-offset
 * range computed against the masked text names the exact same range in the ORIGINAL source. This
 * module holds the small, dependency-free pieces `parseSynapseXml.tsx` (which does the offset
 * tracking while scanning tags) and `mediatorCatalog.tsx` (which builds summaries, including for
 * child elements like `call`'s `<http>` or `payloadFactory`'s `<format>`) both need to recover
 * original, unmasked values - kept in their own module so the two don't import each other.
 */

/** Per-element raw (un-masked) info, keyed by the element from the masked-text DOM. */
export interface RawElementInfo {
    /** Attribute values read back from the ORIGINAL `.j2` source instead of the DOM (which was
     * parsed from j2-masked text), so e.g. `uri-template="{{token_url}}"` survives intact. */
    attrs: Record<string, string>;
    /** This element's raw inner text/markup (between its opening tag's `>` and its closing tag's
     * `<`), read from the original source - used for e.g. `payloadFactory`'s `<format>` body. */
    innerText: string;
}

/** Minimal shape `buildRawInfo` needs from a tag-scan event - matches (a subset of)
 * `parseSynapseXml.tsx`'s internal `TagEvent`. */
export interface RawInfoTagEvent {
    startOffset: number;
    tagEndOffset: number;
    closeStartOffset?: number;
}

/**
 * Extracts `name="value"`/`name='value'` pairs from a raw (unmasked) opening-tag source
 * substring, e.g. `<http method="post" uri-template="{{token_url}}"`. Deliberately not a full XML
 * attribute parser - just enough to recover original attribute values for display, since the
 * structural parse already happened against the (safely maskable) DOM.
 * @param {string} rawTag Raw opening-tag text, from the original `.j2` source
 * @returns {Record<string, string>} Attribute name -> original (unmasked) value
 */
function extractRawAttrs(rawTag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([a-zA-Z_][-\w.:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match = re.exec(rawTag);
    while (match) {
        const name = match[1];
        const value = match[2] !== undefined ? match[2] : match[3];
        if (name !== 'xmlns' && !name.startsWith('xmlns:')) {
            attrs[name] = value;
        }
        match = re.exec(rawTag);
    }
    return attrs;
}

/** A `<![CDATA[ ... ]]>` block's raw inner text is unwrapped for display - callers see the
 * literal payload content (e.g. a JSON template with `{{ }}` placeholders), not the CDATA
 * markers. */
function stripCData(text: string): string {
    const trimmed = text.trim();
    const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(trimmed);
    return match ? match[1] : trimmed;
}

/**
 * Builds the `Element -> RawElementInfo` map used to recover original (unmasked) attribute
 * values and inner text for every element in the parsed tree.
 * @param {Element[]} domOrder Every element of the parsed (masked-text) DOM, in document order
 * @param {RawInfoTagEvent[]} events The matching tag-scan events, zipped 1:1 with `domOrder`
 * @param {string} source The ORIGINAL (unmasked) `.j2` source - same length/line layout as the
 * masked text the scanner/DOM were built from, so the events' offsets apply unchanged
 * @returns {Map<Element, RawElementInfo>} Raw attrs/inner-text per element
 */
export function buildRawInfo(
    domOrder: Element[],
    events: (RawInfoTagEvent | undefined)[],
    source: string,
): Map<Element, RawElementInfo> {
    const map = new Map<Element, RawElementInfo>();
    domOrder.forEach((el, idx) => {
        const event = events[idx];
        if (!event) return;
        const rawTag = source.slice(event.startOffset, event.tagEndOffset + 1);
        const innerText = event.closeStartOffset !== undefined
            ? stripCData(source.slice(event.tagEndOffset + 1, event.closeStartOffset))
            : '';
        map.set(el, { attrs: extractRawAttrs(rawTag), innerText });
    });
    return map;
}

/** Looks up an element's raw attribute, falling back to the (possibly masked) DOM attribute when
 * there is no raw info for it - e.g. a synthetic/detached element never scanned. */
export function rawAttrOf(
    el: Element | null | undefined,
    name: string,
    rawInfo?: Map<Element, RawElementInfo>,
): string {
    if (!el) return '';
    const raw = rawInfo?.get(el);
    if (raw && raw.attrs[name] !== undefined) return raw.attrs[name];
    return el.getAttribute(name) || '';
}

/** Looks up an element's raw inner text, falling back to the (possibly masked) `textContent`. */
export function rawTextOf(el: Element | null | undefined, rawInfo?: Map<Element, RawElementInfo>): string {
    if (!el) return '';
    const raw = rawInfo?.get(el);
    if (raw) return raw.innerText;
    return (el.textContent || '').trim();
}

export default buildRawInfo;
