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

export interface MediatorSnippet {
    id: string;
    label: string;
    description: string;
    /** Monaco snippet body: `\n` separated lines, `${n:placeholder}` tab stops supported */
    body: string;
}

export const MEDIATOR_SNIPPETS: MediatorSnippet[] = [
    {
        id: 'property-set',
        label: 'Property (set)',
        description: 'Sets a Synapse/axis2/transport property',
        body: '<property name="${1:PROP_NAME}" value="${2:value}" scope="${3:default}"/>',
    },
    {
        id: 'property-set-expression',
        label: 'Property (set from expression)',
        description: 'Sets a property from a SynapseXPath/JsonPath expression',
        body: '<property name="${1:PROP_NAME}" expression="${2:json-eval($.path)}" scope="${3:default}"/>',
    },
    {
        id: 'property-remove',
        label: 'Property (remove)',
        description: 'Removes a previously set property',
        body: '<property name="${1:PROP_NAME}" action="remove" scope="${2:default}"/>',
    },
    {
        id: 'header-set',
        label: 'Header (set)',
        description: 'Sets a transport header',
        body: '<header name="${1:X-Header}" value="${2:value}" scope="transport"/>',
    },
    {
        id: 'header-remove',
        label: 'Header (remove)',
        description: 'Removes a transport header',
        body: '<header name="${1:X-Header}" action="remove" scope="transport"/>',
    },
    {
        id: 'payloadfactory-json',
        label: 'Payload Factory (JSON)',
        description: 'Builds a JSON payload from a template and arguments',
        body: [
            '<payloadFactory media-type="json">',
            '\t<format>{',
            '\t\t"${1:field}": "$1"',
            '\t}</format>',
            '\t<args>',
            '\t\t<arg expression="${2:get-property(\'ORIGINAL_JSON_PAYLOAD\')}"/>',
            '\t</args>',
            '</payloadFactory>',
        ].join('\n'),
    },
    {
        id: 'payloadfactory-text',
        label: 'Payload Factory (text)',
        description: 'Builds a text/form-urlencoded payload from a template',
        body: [
            '<payloadFactory media-type="text">',
            '\t<format>${1:key}=$1</format>',
            '\t<args>',
            '\t\t<arg value="${2:value}"/>',
            '\t</args>',
            '</payloadFactory>',
        ].join('\n'),
    },
    {
        id: 'payloadfactory-xml',
        label: 'Payload Factory (XML)',
        description: 'Builds an XML payload from a template',
        body: [
            '<payloadFactory media-type="xml">',
            '\t<format>',
            '\t\t<root xmlns="">$1</root>',
            '\t</format>',
            '\t<args>',
            '\t\t<arg value="${1:value}"/>',
            '\t</args>',
            '</payloadFactory>',
        ].join('\n'),
    },
    {
        id: 'log-custom',
        label: 'Log (custom, with property)',
        description: 'Logs a custom message with one property',
        body: [
            '<log level="custom">',
            '\t<property name="${1:LOG_LABEL}" value="${2:message}"/>',
            '</log>',
        ].join('\n'),
    },
    {
        id: 'filter-then-else',
        label: 'Filter (then/else)',
        description: 'Conditionally branches the flow',
        body: [
            '<filter source="${1:get-property(\'axis2\',\'HTTP_SC\')}" regex="${2:200}">',
            '\t<then>',
            '\t\t${3:<!-- mediators for the true branch -->}',
            '\t</then>',
            '\t<else>',
            '\t\t${4:<!-- mediators for the false branch -->}',
            '\t</else>',
            '</filter>',
        ].join('\n'),
    },
    {
        id: 'switch',
        label: 'Switch',
        description: 'Multi-way branch on a source expression',
        body: [
            '<switch source="${1:get-property(\'QUERY_PARAM\')}">',
            '\t<case regex="${2:value1}">',
            '\t\t${3:<!-- mediators -->}',
            '\t</case>',
            '\t<default>',
            '\t\t${4:<!-- mediators -->}',
            '\t</default>',
            '</switch>',
        ].join('\n'),
    },
    {
        id: 'call-blocking-http',
        label: 'Call (blocking, HTTP endpoint)',
        description: 'Blocking outbound call to an inline HTTP endpoint',
        body: [
            '<call blocking="true">',
            '\t<endpoint>',
            '\t\t<http method="${1:post}" uri-template="${2:{{endpoint_url\\}\\}}"/>',
            '\t</endpoint>',
            '</call>',
        ].join('\n'),
    },
    {
        id: 'respond',
        label: 'Respond',
        description: 'Sends the current message back to the client immediately',
        body: '<respond/>',
    },
    {
        id: 'drop',
        label: 'Drop',
        description: 'Terminates the flow without responding',
        body: '<drop/>',
    },
    {
        id: 'enrich',
        label: 'Enrich',
        description: 'Copies content from a source to a target location in the message',
        body: [
            '<enrich>',
            '\t<source type="${1:body}"/>',
            '\t<target type="${2:property}" property="${3:RESULT}"/>',
            '</enrich>',
        ].join('\n'),
    },
    {
        id: 'script',
        label: 'Script (nashorn/js)',
        description: 'Inline script mediator',
        body: [
            '<script language="${1:js}">',
            '\t${2:mc.setPayloadJSON({});}',
            '</script>',
        ].join('\n'),
    },
];

export default MEDIATOR_SNIPPETS;
