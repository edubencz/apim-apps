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

export interface StarterTemplate {
    id: string;
    label: string;
    description: string;
    content: string;
}

const TOKEN_EXCHANGE_TEMPLATE = `<!-- Capture the original request so it can be restored after the token exchange -->
<property name="ORIGINAL_JSON_PAYLOAD" expression="json-eval($)" scope="default" type="STRING"/>
<property name="ORIGINAL_HTTP_METHOD" expression="get-property('axis2','HTTP_METHOD')"/>
<property name="ORIGINAL_MESSAGE_TYPE" expression="get-property('axis2','messageType')"/>
<property name="ORIGINAL_CONTENT_TYPE" expression="get-property('axis2','ContentType')"/>
<property name="ORIGINAL_REST_URL_POSTFIX" expression="get-property('axis2','REST_URL_POSTFIX')"/>
<property name="REST_URL_POSTFIX" action="remove" scope="axis2"/>
<property name="HTTP_METHOD" value="POST" scope="axis2"/>
<property name="messageType" value="application/x-www-form-urlencoded" scope="axis2"/>
<property name="ContentType" value="application/x-www-form-urlencoded" scope="axis2"/>
<payloadFactory media-type="text">
    <format>username={{username}}&amp;password={{password}}&amp;grant_type=password</format>
    <args/>
</payloadFactory>
<call blocking="true">
    <endpoint>
        <http method="post" uri-template="{{token_url}}"/>
    </endpoint>
</call>
<log level="full">
    <property name="LEAN_AUTH_RESPONSE" value="Token endpoint response"/>
</log>
<filter source="get-property('axis2','HTTP_SC')" regex="200">
    <then>
        <property name="LEAN_ACCESS_TOKEN" expression="json-eval($.access_token)" scope="default"/>
        <payloadFactory media-type="json">
            <format>$1</format>
            <args>
                <arg expression="get-property('ORIGINAL_JSON_PAYLOAD')"/>
            </args>
        </payloadFactory>
        <property name="Authorization" expression="fn:concat('Bearer ', get-property('LEAN_ACCESS_TOKEN'))" scope="transport"/>
    </then>
    <else>
        <log level="custom">
            <property name="LEAN_AUTH_ERROR" value="Token endpoint returned non-200"/>
        </log>
        <property name="HTTP_SC" value="401" scope="axis2"/>
        <payloadFactory media-type="json">
            <format>{
                "message": "Unable to obtain the authentication token from the token endpoint."
            }</format>
            <args/>
        </payloadFactory>
        <respond/>
    </else>
</filter>
<property name="HTTP_METHOD" expression="get-property('ORIGINAL_HTTP_METHOD')" scope="axis2"/>
<property name="messageType" expression="get-property('ORIGINAL_MESSAGE_TYPE')" scope="axis2"/>
<property name="ContentType" expression="get-property('ORIGINAL_CONTENT_TYPE')" scope="axis2"/>
<property name="REST_URL_POSTFIX" expression="get-property('ORIGINAL_REST_URL_POSTFIX')" scope="axis2"/>
`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
    {
        id: 'blank',
        label: 'Blank',
        description: 'An empty policy body',
        content: '',
    },
    {
        id: 'add-header',
        label: 'Add header',
        description: 'Adds a static transport header to the message',
        content: '<header name="X-Header-Name" value="header-value" scope="transport"/>\n',
    },
    {
        id: 'remove-header',
        label: 'Remove header',
        description: 'Removes a transport header from the message',
        content: '<header name="X-Header-Name" action="remove" scope="transport"/>\n',
    },
    {
        id: 'json-transform',
        label: 'JSON transform',
        description: 'Rebuilds the JSON body using a payloadFactory template',
        content: [
            '<payloadFactory media-type="json">',
            '    <format>{',
            '        "transformed": true,',
            '        "original": $1',
            '    }</format>',
            '    <args>',
            '        <arg expression="json-eval($)"/>',
            '    </args>',
            '</payloadFactory>',
            '',
        ].join('\n'),
    },
    {
        id: 'conditional-respond',
        label: 'Conditional respond',
        description: 'Responds immediately when a condition on the message is met',
        content: [
            '<filter source="get-property(\'axis2\',\'HTTP_METHOD\')" regex="GET">',
            '    <then>',
            '        <payloadFactory media-type="json">',
            '            <format>{"message": "handled inline"}</format>',
            '            <args/>',
            '        </payloadFactory>',
            '        <respond/>',
            '    </then>',
            '    <else>',
            '        <!-- fall through to the backend -->',
            '    </else>',
            '</filter>',
            '',
        ].join('\n'),
    },
    {
        id: 'token-exchange-auth',
        label: 'Token exchange + auth',
        description: 'Exchanges credentials for a bearer token before calling the backend '
            + '(based on the lean-auth-policy sample)',
        content: TOKEN_EXCHANGE_TEMPLATE,
    },
];

export default STARTER_TEMPLATES;
