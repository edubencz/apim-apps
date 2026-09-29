/*
 * Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
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

import React, { useContext, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import PropTypes from 'prop-types';
import Typography from '@mui/material/Typography';
import { FormattedMessage } from 'react-intl';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import LanguageIcon from '@mui/icons-material/Language';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import API from 'AppData/api';
import MCPServer from 'AppData/MCPServer';
import ApiContext from 'AppComponents/Apis/Details/components/ApiContext';
import { green } from '@mui/material/colors';
import Tools from 'AppComponents/MCPServers/Details/Overview/Tools';
import Resources from './Resources';
import Operations from './Operations';
import ProductResources from './ProductResources';
import Configuration from './Configuration';
import CustomizedStepper from './CustomizedStepper';
import MetaData from './MetaData';
import Endpoints from './Endpoints';
import Topics from './Topics';
import AssociatedAPI from './AssociatedAPI';
import GatewayUrls from './GatewayUrls';
import OverviewCard from './OverviewCard';

const PREFIX = 'Overview';

const classes = {
    root: `${PREFIX}-root`,
    contentWrapper: `${PREFIX}-contentWrapper`,
    buttonSuccess: `${PREFIX}-buttonSuccess`,
    checkItem: `${PREFIX}-checkItem`,
    divider: `${PREFIX}-divider`,
    chip: `${PREFIX}-chip`,
    imageContainer: `${PREFIX}-imageContainer`,
    imageWrapper: `${PREFIX}-imageWrapper`,
    subtitle: `${PREFIX}-subtitle`,
    specialGap: `${PREFIX}-specialGap`,
    resourceTitle: `${PREFIX}-resourceTitle`,
    ListRoot: `${PREFIX}-ListRoot`,
    titleWrapper: `${PREFIX}-titleWrapper`,
    title: `${PREFIX}-title`,
    helpButton: `${PREFIX}-helpButton`,
    helpIcon: `${PREFIX}-helpIcon`,
    htmlTooltip: `${PREFIX}-htmlTooltip`,
    lifecycleWrapper: `${PREFIX}-lifecycleWrapper`,
    lifecycleIcon: `${PREFIX}-lifecycleIcon`,
    leftSideWrapper: `${PREFIX}-leftSideWrapper`,
    notConfigured: `${PREFIX}-notConfigured`,
    url: `${PREFIX}-url`,
    stepperWrapper: `${PREFIX}-stepperWrapper`,
};


const Root = styled('div')(({ theme }) => ({
    [`& .${classes.root}`]: {
        ...theme.mixins.gutters(),
        paddingTop: theme.spacing(2),
        paddingBottom: theme.spacing(2),
    },

    [`& .${classes.contentWrapper}`]: {
        marginTop: theme.spacing(2),
    },

    [`& .${classes.buttonSuccess}`]: {
        backgroundColor: green[500],
        '&:hover': {
            backgroundColor: green[700],
        },
    },

    [`& .${classes.checkItem}`]: {
        textAlign: 'center',
    },

    [`& .${classes.divider}`]: {
        marginTop: 20,
        marginBottom: 20,
    },

    [`& .${classes.chip}`]: {
        margin: theme.spacing(0.5),
        padding: 0,
        height: 'auto',
        '& span': {
            padding: '0 5px',
        },
    },

    [`& .${classes.imageContainer}`]: {
        display: 'flex',
    },

    [`& .${classes.imageWrapper}`]: {
        marginRight: theme.spacing(3),
    },

    [`& .${classes.subtitle}`]: {
        marginTop: theme.spacing(0),
        ...theme.typography.body2,
        color: theme.palette.text.secondary,
        fontWeight: 500,
    },

    [`& .${classes.specialGap}`]: {
        marginTop: theme.spacing(3),
    },

    [`& .${classes.resourceTitle}`]: {
        marginBottom: theme.spacing(3),
    },

    [`& .${classes.ListRoot}`]: {
        padding: 0,
        margin: 0,
    },

    [`& .${classes.titleWrapper}`]: {
        display: 'flex',
        justifyContent: 'flex-end',
    },

    // Section titles are rendered by the OverviewCard header
    [`& .${classes.title}`]: {
        display: 'none',
    },

    [`& .${classes.helpButton}`]: {
        padding: 0,
        minWidth: 20,
    },

    [`& .${classes.helpIcon}`]: {
        fontSize: 16,
    },

    [`& .${classes.htmlTooltip}`]: {
        backgroundColor: '#f5f5f9',
        color: 'rgba(0, 0, 0, 0.87)',
        maxWidth: 220,
        fontSize: theme.typography.pxToRem(14),
        border: '1px solid #dadde9',
        '& b': {
            fontWeight: theme.typography.fontWeightMedium,
        },
    },

    [`& .${classes.lifecycleWrapper}`]: {
        display: 'flex',
        alignItems: 'center',
    },

    [`& .${classes.lifecycleIcon}`]: {
        fontSize: 36,
        color: 'green',
        marginRight: theme.spacing(1),
    },

    [`& .${classes.leftSideWrapper}`]: {
        paddingRight: theme.spacing(2),
    },

    [`& .${classes.notConfigured}`]: {
        color: 'rgba(0, 0, 0, 0.40)',
    },

    [`& .${classes.url}`]: {
        maxWidth: '100%',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },

    [`& .${classes.stepperWrapper}`]: {
        padding: theme.spacing(3),
        boxSizing: 'border-box',
    }
}));

/**
 * API Overview page
 *
 * @param {Object} props - Component props
 * @param {Object} props.api - The API object
 * @param {Function} props.setOpenPageSearch - Function to set page search state
 * @returns {JSX.Element} - The Overview component
 */
function Overview(props) {
    const {  api: newApi, setOpenPageSearch } = props; // TODO <tmkasun>: Remove newApi prop & merge to api
    const { api } = useContext(ApiContext);
    let loadEndpoints;
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 's') {
                const { target } = event;
                // prevent opening page search when typing `s` in header API search input
                if (target.id !== 'searchQuery') {
                    setOpenPageSearch(true);
                }
                // TO prevent overlapping the event handlers in header search and page search itself
                if (target.id !== 'page-search-input' && target.id !== 'searchQuery') {
                    event.preventDefault(); // To prevent form submissions
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [setOpenPageSearch]);
    if (api.apiType === API.CONSTS.API || (api.type === MCPServer.CONSTS.MCP
        && !api.isMCPServerFromExistingAPI())) {
        loadEndpoints = <Endpoints parentClasses={classes} api={api} />;
    } else if (api.type === MCPServer.CONSTS.MCP && api.isMCPServerFromExistingAPI()) {
        loadEndpoints = <AssociatedAPI parentClasses={classes} api={api} />;
    }

    /**
     * Get the resources class based on the API type
     * @param {string} apiType - The type of the API
     * @returns {JSX.Element} - The resources class component
     */
    function getResourcesClassForAPIs(apiType) {
        switch (apiType) {
            case 'GRAPHQL':
                return <Operations parentClasses={classes} api={api} />;
            case 'APIPRODUCT':
                return <ProductResources parentClasses={classes} api={api} />;
            case 'MCP':
                return <Tools parentClasses={classes} mcpServer={api} />;
            case 'WS':
            case 'WEBSUB':
            case 'ASYNC':
            case 'SSE':
                return <Topics parentClasses={classes} api={api} />;
            default:
                return <Resources parentClasses={classes} api={api} />;
        }
    }

    if (newApi.apiType === API.CONSTS.APIProduct) {
        api.type = API.CONSTS.APIProduct;
    }
    const showLifecycle = (api.apiType !== API.CONSTS.API || !api.advertiseInfo.advertised)
        && api.gatewayType !== 'solace';
    const showDeploymentInfo = showLifecycle;
    const resourcesTitle = api.type === 'GraphQL' || api.type === 'GRAPHQL' ? (
        <FormattedMessage id='Apis.Details.NewOverview.Operations.operations' defaultMessage='Operation' />
    ) : (
        <FormattedMessage id='Apis.Details.NewOverview.Resources.resources' defaultMessage='Resources' />
    );
    const endpointsTitle = api.type === MCPServer.CONSTS.MCP && api.isMCPServerFromExistingAPI() ? (
        <FormattedMessage
            id='Apis.Details.NewOverview.Overview.associated.api'
            defaultMessage='Associated API'
        />
    ) : (
        <FormattedMessage
            id='Apis.Details.NewOverview.Overview.backend.endpoints'
            defaultMessage='Backend Endpoints'
        />
    );
    return (
        (<Root>
            <Typography variant='h4' component='h2' align='left' className={classes.mainTitle}>
                <FormattedMessage
                    id='Apis.Details.Overview.Overview.topic.header'
                    defaultMessage='Overview'
                />
            </Typography>
            <Box display='flex' flexDirection='column' gap={3} mt={2}>
                {showLifecycle && (
                    <Paper variant='outlined' sx={{ borderRadius: '12px' }} className={classes.stepperWrapper}>
                        <CustomizedStepper />
                    </Paper>
                )}
                {showDeploymentInfo && (
                    <OverviewCard
                        title={(
                            <FormattedMessage
                                id='Apis.Details.NewOverview.GatewayUrls.title'
                                defaultMessage='Gateway URLs'
                            />
                        )}
                        icon={<LanguageIcon />}
                    >
                        <GatewayUrls api={api} />
                    </OverviewCard>
                )}
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <OverviewCard
                            title={(
                                <FormattedMessage
                                    id='Apis.Details.NewOverview.Overview.details'
                                    defaultMessage='Details'
                                />
                            )}
                            icon={<InfoOutlinedIcon />}
                        >
                            <MetaData parentClasses={classes} />
                        </OverviewCard>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <OverviewCard
                            title={(
                                <FormattedMessage
                                    id='Apis.Details.NewOverview.MetaData.config'
                                    defaultMessage='Configuration'
                                />
                            )}
                            icon={<SettingsOutlinedIcon />}
                        >
                            <Configuration parentClasses={classes} />
                        </OverviewCard>
                    </Grid>
                    {api.type === 'WEBSUB' ? (
                        <Grid item xs={12}>
                            <OverviewCard title={resourcesTitle} icon={<AccountTreeOutlinedIcon />}>
                                {getResourcesClassForAPIs(api.type)}
                            </OverviewCard>
                        </Grid>
                    ) : (
                        <>
                            <Grid item xs={12} md={6}>
                                <OverviewCard title={resourcesTitle} icon={<AccountTreeOutlinedIcon />}>
                                    {getResourcesClassForAPIs(api.type)}
                                </OverviewCard>
                            </Grid>
                            {loadEndpoints && (
                                <Grid item xs={12} md={6}>
                                    <OverviewCard title={endpointsTitle} icon={<StorageOutlinedIcon />}>
                                        {loadEndpoints}
                                    </OverviewCard>
                                </Grid>
                            )}
                        </>
                    )}
                </Grid>
            </Box>
        </Root>)
    );
}

Overview.propTypes = {
    classes: PropTypes.shape({}).isRequired,
    api: PropTypes.shape({
        id: PropTypes.string,
    }).isRequired,
    setOpenPageSearch: PropTypes.func.isRequired,
};

export default (Overview);
