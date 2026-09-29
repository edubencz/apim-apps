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

import CONSTS from 'AppData/Constants';

/**
 * Build a URL prefix (scheme://host[:port]) omitting default ports.
 * @param {string} scheme URL scheme
 * @param {string} host Host name
 * @param {number|string} port Port number
 * @returns {string} base URL
 */
function buildBase(scheme, host, port) {
    const isDefault = (scheme === 'https' && Number(port) === 443) || (scheme === 'http' && Number(port) === 80);
    return `${scheme}://${host}${isDefault ? '' : ':' + port}`;
}

/**
 * Build the gateway invocation URLs of an API for each deployed environment.
 * Follows the same rules as the Try Out console and the Deployments page.
 *
 * @param {Object} api API (or API Product / MCP Server) object
 * @param {Array} deployments Deployed revisions (already filtered, items with `name` and `vhost`)
 * @param {Array} environments Gateway environments from publisher settings
 * @returns {Array} list of { envName, displayName, vhost, urls: [{ transport, url }] }
 */
export function buildGatewayUrls(api, deployments, environments) {
    if (!api || !deployments) {
        return [];
    }
    const isWebSocket = api.type === 'WS';
    const context = `${api.context || ''}`;
    const version = api.version ? `${api.version}` : '';

    return deployments.map((deployment) => {
        const env = (environments || []).find((e) => e.name === deployment.name);
        const displayName = env && env.displayName ? env.displayName : deployment.name;
        let vhost = env && env.vhosts && env.vhosts.find((v) => v.host === deployment.vhost
            || (isWebSocket && v.wsHost === deployment.vhost));
        if (!vhost) {
            vhost = { ...CONSTS.DEFAULT_VHOST, host: deployment.vhost };
        }
        const httpContext = vhost.httpContext
            ? '/' + vhost.httpContext.replace(/^\//, '').replace(/\/$/, '') : '';

        let apiPath;
        if (context.includes('{version}')) {
            apiPath = context.replaceAll('{version}', version);
        } else {
            apiPath = version ? `${context}/${version}` : context;
        }
        if (apiPath && !apiPath.startsWith('/')) {
            apiPath = `/${apiPath}`;
        }

        const urls = [];
        if (isWebSocket) {
            [['wss', vhost.wssHost, vhost.wssPort], ['ws', vhost.wsHost, vhost.wsPort]].forEach(([scheme, h, port]) => {
                const host = h || deployment.vhost;
                if (port && Number(port) !== -1) {
                    urls.push({ transport: scheme, url: `${scheme}://${host}:${port}${httpContext}${apiPath}` });
                }
            });
        } else {
            const transports = (api.transport && api.transport.length > 0) ? api.transport : ['https', 'http'];
            transports.slice().sort((a, b) => ((a > b) ? -1 : 1)).forEach((transport) => {
                const port = vhost[`${transport}Port`];
                if (port && Number(port) !== -1) {
                    urls.push({
                        transport,
                        url: `${buildBase(transport, vhost.host || deployment.vhost, port)}${httpContext}${apiPath}`,
                    });
                }
            });
        }
        return {
            envName: deployment.name, displayName, vhost: deployment.vhost, urls,
        };
    });
}

export default buildGatewayUrls;
