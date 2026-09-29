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

import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MCPServer from 'AppData/MCPServer';
import { usePublisherSettings } from 'AppComponents/Shared/AppContext';
import { getBasePath } from 'AppComponents/Shared/Utils';
import { buildGatewayUrls } from './utils/gatewayUrls';

/**
 * Single URL row with copy / open buttons.
 * @param {*} props Component props
 * @returns {JSX.Element} row
 */
function UrlRow({ transport, url }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        const done = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => {});
        }
    };
    return (
        <Box display='flex' alignItems='center' sx={{ minWidth: 0 }}>
            <Typography
                component='code'
                variant='body2'
                sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    px: 1,
                    py: 0.5,
                }}
            >
                {url}
            </Typography>
            <Tooltip
                title={copied
                    ? <FormattedMessage id='Apis.Details.NewOverview.GatewayUrls.copied' defaultMessage='Copied' />
                    : <FormattedMessage id='Apis.Details.NewOverview.GatewayUrls.copy' defaultMessage='Copy URL' />}
            >
                <IconButton size='small' onClick={copy} aria-label='copy' sx={{ ml: 0.5 }}>
                    {copied ? <CheckIcon fontSize='small' color='success' /> : <ContentCopyIcon fontSize='small' />}
                </IconButton>
            </Tooltip>
            {(transport === 'https' || transport === 'http') && (
                <Tooltip
                    title={(
                        <FormattedMessage
                            id='Apis.Details.NewOverview.GatewayUrls.open'
                            defaultMessage='Open in new tab'
                        />
                    )}
                >
                    <IconButton
                        size='small'
                        component='a'
                        href={url}
                        target='_blank'
                        rel='noopener noreferrer'
                        aria-label='open'
                    >
                        <OpenInNewIcon fontSize='small' />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}

UrlRow.propTypes = {
    transport: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired,
};

/**
 * Shows the gateway invocation URLs of the API per deployed environment.
 *
 * @param {*} props Component props
 * @returns {JSX.Element} GatewayUrls
 */
function GatewayUrls({ api }) {
    const { data: settings } = usePublisherSettings();
    const [deployments, setDeployments] = useState(null);
    const isMCPServer = api.type === MCPServer.CONSTS.MCP;

    useEffect(() => {
        let cancelled = false;
        let promise;
        if (isMCPServer) {
            promise = MCPServer.getDeployedRevisions(api.isRevision ? api.revisionedApiId : api.id);
        } else {
            promise = api.getDeployedRevisions(api.id);
        }
        promise
            .then((response) => {
                if (!cancelled) {
                    setDeployments((response.body || []).filter((d) => d.status !== 'CREATED'));
                }
            })
            .catch((error) => {
                console.error('Error while loading deployments', error);
                if (!cancelled) {
                    setDeployments([]);
                }
            });
        return () => { cancelled = true; };
    }, [api.id]);

    const rows = useMemo(() => {
        if (!deployments || !settings) {
            return null;
        }
        return buildGatewayUrls(api, deployments, settings.environment);
    }, [api, deployments, settings]);

    if (!rows) {
        return (
            <Box>
                <Skeleton variant='text' width='60%' height={32} />
                <Skeleton variant='text' width='45%' height={32} />
            </Box>
        );
    }

    if (rows.length === 0) {
        return (
            <Box>
                <Typography variant='body2' color='text.secondary'>
                    <FormattedMessage
                        id='Apis.Details.NewOverview.GatewayUrls.not.deployed'
                        defaultMessage='Not deployed to any gateway yet.'
                    />
                    {' '}
                    <Link component={RouterLink} to={getBasePath(api.apiType) + api.id + '/deployments'}>
                        <FormattedMessage
                            id='Apis.Details.NewOverview.GatewayUrls.go.to.deployments'
                            defaultMessage='Go to Deployments'
                        />
                    </Link>
                </Typography>
            </Box>
        );
    }

    return (
        <Box display='flex' flexDirection='column' gap={2}>
            {rows.map((row) => (
                <Box key={`${row.envName}-${row.vhost}`}>
                    <Chip label={row.displayName} size='small' color='primary' variant='outlined' sx={{ mb: 1 }} />
                    <Box display='flex' flexDirection='column' gap={0.5}>
                        {row.urls.length === 0 ? (
                            <Typography variant='body2' color='text.secondary'>
                                <FormattedMessage
                                    id='Apis.Details.NewOverview.GatewayUrls.no.transport'
                                    defaultMessage='No enabled transport for this gateway.'
                                />
                            </Typography>
                        ) : row.urls.map(({ transport, url }) => (
                            <UrlRow key={url} transport={transport} url={url} />
                        ))}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

GatewayUrls.propTypes = {
    api: PropTypes.shape({
        id: PropTypes.string,
    }).isRequired,
};

export default GatewayUrls;
