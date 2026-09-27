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

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

export interface DetectedEndpoint {
    nodeId: string;
    tag: string;
    /** The URL/URI-template as found in the summary (may still contain `{{attr}}` placeholders) */
    rawUrl: string;
    /** `rawUrl` with any `{{attr}}` placeholder substituted by its current attribute value, when provided */
    resolvedUrl: string;
}

/**
 * Best-effort extraction of the URI a `<call>`/`<send>` mediator's `endpoint/http@uri-template` or
 * `endpoint/address@uri` targets, from the one-line `summary` string `diagram/mediatorCatalog.ts`
 * already computed for the flow diagram (e.g. `"POST https://idp.example.com/token"` or
 * `"https://idp.example.com/token"`). `FlowNode` does not retain the original DOM element, so this
 * is the only signal available to the "Add mock from endpoint" helper in `MocksEditor`.
 * @param {string} summary The mediator's diagram summary text
 * @returns {string} The URI portion (method prefix stripped, if present); '' when none was found
 */
export function extractUrlFromSummary(summary: string): string {
    if (!summary) {
        return '';
    }
    let text = summary.trim();
    // The diagram summary is truncated to 60 chars with a trailing ellipsis; strip it so the
    // remaining characters are not mistaken for part of the URL.
    if (text.endsWith('…')) {
        text = text.slice(0, -1);
    }
    const firstSpace = text.indexOf(' ');
    if (firstSpace > 0) {
        const firstToken = text.slice(0, firstSpace);
        if (HTTP_METHODS.has(firstToken.toUpperCase())) {
            text = text.slice(firstSpace + 1).trim();
        }
    }
    return text;
}

/**
 * Substitutes every `{{name}}` occurrence in `url` with `attributeValues[name]`, when that
 * attribute has a defined, non-empty value; placeholders with no known/empty value are left
 * untouched so the user can see which part of the URL still needs a value.
 * @param {string} url URL/URI-template, possibly containing `{{name}}` placeholders
 * @param {Record<string, any>} attributeValues Current attribute values entered in the test panel
 * @returns {string} `url` with resolvable placeholders substituted
 */
export function substituteAttributeValues(url: string, attributeValues: Record<string, any>): string {
    return url.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, name) => {
        const value = attributeValues ? attributeValues[name] : undefined;
        if (value === undefined || value === null || value === '') {
            return match;
        }
        return String(value);
    });
}

/**
 * Walks the parsed flow tree (including every branch) collecting the outbound URL of every
 * `call`/`send` mediator, for the "Add mock from endpoint" helper in `MocksEditor`.
 * @param {FlowNode[]} nodes Top-level parsed flow nodes (`parseSynapseXml(...).nodes`)
 * @param {Record<string, any>} attributeValues Current attribute values, used to resolve `{{var}}` URLs
 * @returns {DetectedEndpoint[]} One entry per `call`/`send` mediator that has a detectable URL
 */
export function extractEndpointsFromFlow(
    nodes: FlowNode[],
    attributeValues: Record<string, any> = {},
): DetectedEndpoint[] {
    const results: DetectedEndpoint[] = [];

    const visit = (list: FlowNode[]) => {
        list.forEach((node) => {
            const lowerTag = (node.tag || '').toLowerCase();
            if (lowerTag === 'call' || lowerTag === 'send') {
                const rawUrl = extractUrlFromSummary(node.summary);
                if (rawUrl) {
                    results.push({
                        nodeId: node.nodeId,
                        tag: node.tag,
                        rawUrl,
                        resolvedUrl: substituteAttributeValues(rawUrl, attributeValues),
                    });
                }
            }
            (node.branches || []).forEach((branch) => visit(branch.nodes));
        });
    };
    visit(nodes || []);
    return results;
}

export default extractEndpointsFromFlow;
