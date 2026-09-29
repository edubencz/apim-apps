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

import React from 'react';
import PropTypes from 'prop-types';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

/**
 * Outlined card with a header (icon + title + optional action) used by the Overview page sections.
 *
 * @param {*} props Component props
 * @returns {JSX.Element} Card
 */
function OverviewCard(props) {
    const {
        title, icon, action, children,
    } = props;
    return (
        <Paper
            variant='outlined'
            sx={{
                borderRadius: '12px',
                p: 3,
                height: '100%',
                boxSizing: 'border-box',
                '& .MuiTypography-body1': { fontSize: (theme) => theme.typography.body2.fontSize },
            }}
        >
            <Box display='flex' alignItems='center' mb={1.5}>
                {icon && <Box display='flex' color='primary.main' mr={1}>{icon}</Box>}
                <Typography variant='subtitle1' component='h2' sx={{ fontWeight: 600, flex: 1 }}>
                    {title}
                </Typography>
                {action}
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            {children}
        </Paper>
    );
}

OverviewCard.defaultProps = {
    icon: null,
    action: null,
};

OverviewCard.propTypes = {
    title: PropTypes.node.isRequired,
    icon: PropTypes.node,
    action: PropTypes.node,
    children: PropTypes.node.isRequired,
};

export default OverviewCard;
