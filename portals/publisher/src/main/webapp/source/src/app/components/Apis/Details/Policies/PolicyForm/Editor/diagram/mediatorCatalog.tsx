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

import { rawAttrOf, rawTextOf } from '../parsing/rawElementInfo';
import type { RawElementInfo } from '../parsing/rawElementInfo';

/**
 * Static, per-tag metadata used to render a mediator in the flow diagram and in the Mediators
 * palette. Colors are expressed per category as a light/dark hex pair (`accent`/`accentDark`) -
 * `FlowDiagram.tsx` and `MediatorPalette.tsx` pick the right one from `theme.palette.mode`, which
 * keeps a single, restrained palette consistent across both surfaces and both themes.
 */
export type MediatorCategory =
    | 'properties'
    | 'transformation'
    | 'flowControl'
    | 'calls'
    | 'logging'
    | 'termination'
    | 'neutral';

export interface CategoryStyle {
    /** Human label used as a group header in the Mediators palette */
    label: string;
    /** Accent color in light mode (left bar, icon circle, chips) */
    accent: string;
    /** Accent color in dark mode */
    accentDark: string;
}

/**
 * One swatch per category, per the visual spec: properties/headers = blue, transformation =
 * violet, flow control = amber, calls/endpoints = teal, logging = slate, termination = rose
 * (drop)/green (respond), unknown = neutral grey.
 */
export const CATEGORY_STYLES: Record<MediatorCategory, CategoryStyle> = {
    properties: { label: 'Properties & headers', accent: '#2563eb', accentDark: '#60a5fa' },
    transformation: { label: 'Transformation', accent: '#7c3aed', accentDark: '#a78bfa' },
    flowControl: { label: 'Flow control', accent: '#b45309', accentDark: '#f59e0b' },
    calls: { label: 'Calls & endpoints', accent: '#0f766e', accentDark: '#2dd4bf' },
    logging: { label: 'Logging', accent: '#475569', accentDark: '#94a3b8' },
    termination: { label: 'Termination', accent: '#e11d48', accentDark: '#fb7185' },
    neutral: { label: 'Other', accent: '#64748b', accentDark: '#94a3b8' },
};

/** Termination mediators that mean "success" rather than "stop/drop" get the green variant. */
const TERMINATION_SUCCESS_ACCENT = { accent: '#15803d', accentDark: '#4ade80' };

export interface MediatorCatalogEntry {
    /** Friendly, user-facing label, e.g. "Set property" rather than the raw tag name */
    label: string;
    category: MediatorCategory;
    /** Name of an @mui/icons-material icon component appropriate for this mediator */
    icon: string;
}

const DEFAULT_ENTRY: MediatorCatalogEntry = {
    label: 'Mediator',
    category: 'neutral',
    icon: 'SettingsEthernetOutlined',
};

export const MEDIATOR_CATALOG: Record<string, MediatorCatalogEntry> = {
    property: { label: 'Set property', category: 'properties', icon: 'LabelOutlined' },
    header: { label: 'Set header', category: 'properties', icon: 'ViewHeadlineOutlined' },
    payloadfactory: { label: 'Payload factory', category: 'transformation', icon: 'BuildOutlined' },
    log: { label: 'Log', category: 'logging', icon: 'ArticleOutlined' },
    filter: { label: 'Filter', category: 'flowControl', icon: 'CallSplitOutlined' },
    switch: { label: 'Switch', category: 'flowControl', icon: 'AltRouteOutlined' },
    call: { label: 'Call endpoint', category: 'calls', icon: 'CallMadeOutlined' },
    send: { label: 'Send', category: 'calls', icon: 'SendOutlined' },
    callout: { label: 'Callout', category: 'calls', icon: 'PhoneForwardedOutlined' },
    respond: { label: 'Respond', category: 'termination', icon: 'ReplyOutlined' },
    drop: { label: 'Drop', category: 'termination', icon: 'BlockOutlined' },
    loopback: { label: 'Loopback', category: 'termination', icon: 'ReplayOutlined' },
    enrich: { label: 'Enrich', category: 'transformation', icon: 'AddBoxOutlined' },
    script: { label: 'Script', category: 'transformation', icon: 'CodeOutlined' },
    datamapper: { label: 'Data mapper', category: 'transformation', icon: 'TransformOutlined' },
    xslt: { label: 'XSLT transform', category: 'transformation', icon: 'TransformOutlined' },
    class: { label: 'Class mediator', category: 'transformation', icon: 'ExtensionOutlined' },
    throttle: { label: 'Throttle', category: 'flowControl', icon: 'SpeedOutlined' },
    cache: { label: 'Cache', category: 'properties', icon: 'StorageOutlined' },
    aggregate: { label: 'Aggregate', category: 'flowControl', icon: 'CallMergeOutlined' },
    clone: { label: 'Clone', category: 'flowControl', icon: 'CallSplitOutlined' },
    iterate: { label: 'Iterate', category: 'flowControl', icon: 'RepeatOutlined' },
    foreach: { label: 'For each', category: 'flowControl', icon: 'RepeatOutlined' },
    validate: { label: 'Validate', category: 'flowControl', icon: 'FactCheckOutlined' },
    sequence: { label: 'Sequence', category: 'neutral', icon: 'ListAltOutlined' },
};

/**
 * Looks up (or falls back to a generic default for) a mediator's catalog entry.
 * @param {string} tag Local (namespace-stripped) tag name
 * @returns {MediatorCatalogEntry} The catalog entry to render this mediator with
 */
export function getMediatorCatalogEntry(tag: string): MediatorCatalogEntry {
    return MEDIATOR_CATALOG[tag.toLowerCase()] || { ...DEFAULT_ENTRY, label: tag };
}

/**
 * Resolves the accent color to paint a mediator's card/lane/chip with, honoring the
 * light/green-vs-rose special case for `respond` vs `drop`/`loopback` inside "termination".
 * @param {string} tag Local tag name
 * @param {'light' | 'dark'} mode Current MUI theme mode
 * @returns {string} A hex color
 */
export function getMediatorAccentColor(tag: string, mode: 'light' | 'dark'): string {
    const entry = getMediatorCatalogEntry(tag);
    const lower = tag.toLowerCase();
    if (entry.category === 'termination' && lower === 'respond') {
        return mode === 'dark' ? TERMINATION_SUCCESS_ACCENT.accentDark : TERMINATION_SUCCESS_ACCENT.accent;
    }
    const style = CATEGORY_STYLES[entry.category];
    return mode === 'dark' ? style.accentDark : style.accent;
}

function truncate(value: string, max = 60): string {
    if (value.length <= max) {
        return value;
    }
    return `${value.slice(0, max - 1)}…`;
}

function firstChildText(element: Element | null | undefined): string {
    if (!element) {
        return '';
    }
    return (element.textContent || '').trim();
}

function firstElementByTag(element: Element, tag: string): Element | null {
    const children = Array.from(element.children);
    return children.find((child) => child.tagName.split(':').pop()?.toLowerCase() === tag) || null;
}

/**
 * Builds the one-line summary shown under a mediator's label on the flow diagram, e.g.
 * `name = value` for `property`, `source ~ regex` for `filter`, method + URI for `call`.
 * @param {string} tag Local tag name of the mediator
 * @param {Record<string, string>} attrs The mediator's own attributes
 * @param {Element} [element] The DOM element itself, used for mediators whose summary comes
 * from a child element (`payloadFactory`'s `<format>`, `call`'s `<endpoint>`, ...)
 * @param {Map<Element, RawElementInfo>} [rawInfo] Item 2 (UX polish): original (unmasked)
 * attrs/inner-text per element, built by `parseSynapseXml`. `element`'s own attrs already come in
 * unmasked via `attrs`, but summaries that read a CHILD element (`<http>`, `<format>`, `<source>`/
 * `<target>`) need this map too, or `{{token_url}}`-style jinja placeholders leak as `xxxxxxxx`.
 * @returns {string} A short, human readable summary
 */
export function summarizeMediator(
    tag: string,
    attrs: Record<string, string>,
    element?: Element,
    rawInfo?: Map<Element, RawElementInfo>,
): string {
    const lower = tag.toLowerCase();
    switch (lower) {
        case 'property': {
            if (attrs.action === 'remove') {
                return `remove ${attrs.name || ''}`;
            }
            const value = attrs.value !== undefined ? attrs.value : attrs.expression;
            return truncate(`${attrs.name || ''} = ${value !== undefined ? value : ''}`);
        }
        case 'header': {
            if (attrs.action === 'remove') {
                return `remove ${attrs.name || ''}`;
            }
            const value = attrs.value !== undefined ? attrs.value : attrs.expression;
            return truncate(`${attrs.name || ''} = ${value !== undefined ? value : ''}`);
        }
        case 'filter': {
            if (attrs.xpath) {
                return truncate(attrs.xpath);
            }
            return truncate(`${attrs.source || ''} ~ ${attrs.regex || ''}`);
        }
        case 'switch':
            return truncate(attrs.source || '');
        case 'call':
        case 'send': {
            const endpoint = element ? firstElementByTag(element, 'endpoint') : null;
            const http = endpoint ? firstElementByTag(endpoint, 'http') : null;
            const address = endpoint ? firstElementByTag(endpoint, 'address') : null;
            if (http) {
                const method = rawAttrOf(http, 'method', rawInfo);
                const uriTemplate = rawAttrOf(http, 'uri-template', rawInfo);
                return truncate(`${method} ${uriTemplate}`.trim());
            }
            if (address) {
                return truncate(rawAttrOf(address, 'uri', rawInfo));
            }
            return attrs.blocking === 'true' ? 'blocking' : '';
        }
        case 'payloadfactory': {
            const format = element ? firstElementByTag(element, 'format') : null;
            const formatText = format ? rawTextOf(format, rawInfo) : firstChildText(format);
            return truncate(`${attrs['media-type'] || ''}: ${formatText}`.trim());
        }
        case 'log':
            return truncate(`level=${attrs.level || 'simple'}`);
        case 'respond':
            return 'respond to client';
        case 'drop':
            return 'drop message';
        case 'enrich': {
            const source = element ? firstElementByTag(element, 'source') : null;
            const target = element ? firstElementByTag(element, 'target') : null;
            const sourceType = (source && rawAttrOf(source, 'type', rawInfo)) || 'body';
            const targetType = (target && rawAttrOf(target, 'type', rawInfo)) || 'body';
            return truncate(`source: ${sourceType} -> target: ${targetType}`);
        }
        case 'script':
            return truncate(attrs.language || '');
        case 'class':
            return truncate(attrs.name || '');
        case 'throttle':
            return 'throttling policy';
        case 'cache':
            return attrs.collector === 'true' ? 'cache collector' : 'cache lookup/store';
        case 'aggregate':
            return truncate(`${attrs.id || ''}`.trim());
        case 'clone':
            return 'clone message';
        case 'iterate':
            return truncate(attrs.expression || '');
        case 'foreach':
            return truncate(attrs.expression || attrs.collection || '');
        case 'validate':
            return 'schema validation';
        default:
            return '';
    }
}

export interface MediatorChip {
    label: string;
}

/**
 * Small, high-signal chips to render on a node's card: property/header scope, whether a `call`
 * blocks, the `payloadFactory` media type, and the `log` level. Returns at most a couple of chips
 * per mediator so cards stay compact.
 * @param {string} tag Local tag name
 * @param {Record<string, string>} attrs The mediator's own attributes
 * @returns {MediatorChip[]} Chips to render, possibly empty
 */
export function getMediatorChips(tag: string, attrs: Record<string, string>): MediatorChip[] {
    const lower = tag.toLowerCase();
    const chips: MediatorChip[] = [];
    switch (lower) {
        case 'property':
        case 'header':
            if (attrs.scope) {
                chips.push({ label: attrs.scope });
            }
            break;
        case 'call':
        case 'send':
            if (attrs.blocking === 'true') {
                chips.push({ label: 'blocking' });
            }
            break;
        case 'payloadfactory':
            if (attrs['media-type']) {
                chips.push({ label: attrs['media-type'] });
            }
            break;
        case 'log':
            chips.push({ label: attrs.level || 'simple' });
            break;
        default:
            break;
    }
    return chips;
}

export default MEDIATOR_CATALOG;
