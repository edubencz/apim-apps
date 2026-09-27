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
 * A branch of a container mediator (e.g. `then`/`else` of a `filter`, `case[i]`/`default` of a
 * `switch`). See `Editor/CONTRACT.md` for the full nodeId contract.
 */
export interface FlowBranch {
    /** Human readable label shown on the diagram (e.g. "then", "case: 200", "default") */
    label: string;
    /** The raw path segment used to build child nodeIds (e.g. "then", "case[2]", "default") */
    key: string;
    nodes: FlowNode[];
}

/**
 * A single mediator in the flow, addressable by `nodeId` (see `Editor/CONTRACT.md`).
 */
export interface FlowNode {
    /** Path of container-relative indices, e.g. "3", "5/then/1", "6/case[2]/0" */
    nodeId: string;
    /** Local (namespace-stripped) tag name, e.g. "property", "filter", "payloadFactory" */
    tag: string;
    attrs: Record<string, string>;
    line: number;
    column: number;
    /** One-line human summary of what this mediator does, see diagram/mediatorCatalog.ts */
    summary: string;
    /** Present only for container mediators (filter/switch/clone/iterate/foreach/throttle/...) */
    branches?: FlowBranch[];
}

export interface ParseError {
    line: number;
    column: number;
    message: string;
}

export interface ParseResult {
    nodes: FlowNode[];
    errors: ParseError[];
    /** True when the document root was a single <sequence> element that got unwrapped */
    hasSequenceRoot: boolean;
    /** Variable names referenced via {{ }}/{% %} across the whole document, see detectVariables */
    detectedVariables: string[];
}
